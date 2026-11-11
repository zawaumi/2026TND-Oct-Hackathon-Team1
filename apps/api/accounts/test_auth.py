"""Firebase の ID トークンの確認（#11）と、初回設定（#12 の API）のテスト。

本物の Google の鍵は使わない。テストの中で鍵と証明書を作り、それで署名したトークンを渡す。
"""

import datetime
import time
from unittest import mock

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from google.auth import crypt, jwt
from rest_framework.test import APIClient

from accounts import firebase
from accounts.firebase import InvalidToken, verify_id_token
from peers.models import Peer

PROJECT = "test-project"
KID = "test-key"


def _make_key():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    pem_key = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    return pem_key, cert.public_bytes(serialization.Encoding.PEM).decode()


KEY_PEM, CERT_PEM = _make_key()
OTHER_KEY_PEM, _ = _make_key()
CERTS = {KID: CERT_PEM}


def make_token(uid="uid-1", *, project=PROJECT, key_pem=KEY_PEM, kid=KID, **overrides):
    now = int(time.time())
    claims = {
        "iss": f"https://securetoken.google.com/{project}",
        "aud": project,
        "auth_time": now - 60,
        "sub": uid,
        "user_id": uid,
        "iat": now - 30,
        "exp": now + 3600,
    }
    claims.update(overrides)
    signer = crypt.RSASigner.from_string(key_pem, key_id=kid)
    return jwt.encode(signer, claims).decode()


class VerifyIdTokenTests(TestCase):
    def verify(self, token):
        return verify_id_token(token, certs=CERTS, project_id=PROJECT)

    def test_valid_token(self):
        self.assertEqual(self.verify(make_token())["sub"], "uid-1")

    def test_rejects_bad_tokens(self):
        now = int(time.time())
        bad = {
            "expired": make_token(exp=now - 120, iat=now - 3700),
            "wrong audience": make_token(aud="other-project"),
            "wrong issuer": make_token(iss="https://securetoken.google.com/other-project"),
            "other project": make_token(project="other-project"),
            "signed by another key": make_token(key_pem=OTHER_KEY_PEM),
            "unknown kid": make_token(kid="unknown"),
            "empty subject": make_token(uid=""),
            "long subject": make_token(uid="x" * 129),
            "issued in the future": make_token(iat=now + 600, exp=now + 4000),
            "auth_time in the future": make_token(auth_time=now + 600),
            "not a jwt": "abc",
        }
        for label, token in bad.items():
            with self.subTest(label), self.assertRaises(InvalidToken):
                self.verify(token)

    def test_tampered_payload(self):
        head, _, sig = make_token("uid-1").split(".")
        _, body, _ = make_token("uid-2").split(".")
        with self.assertRaises(InvalidToken):
            self.verify(f"{head}.{body}.{sig}")

    def test_alg_none_is_rejected(self):
        import base64
        import json

        enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
        token = f"{enc({'alg': 'none', 'kid': KID})}.{enc({'sub': 'uid-1', 'aud': PROJECT})}."
        with self.assertRaises(InvalidToken):
            self.verify(token)

    def test_certs_unavailable(self):
        firebase._cache.update(certs=None, expires=0)
        with mock.patch.object(firebase.urllib.request, "urlopen", side_effect=OSError("offline")):
            with self.assertRaises(InvalidToken):
                verify_id_token(make_token(), project_id=PROJECT)


@override_settings(FIREBASE_PROJECT_ID=PROJECT)
class ApiAuthTests(TestCase):
    def setUp(self):
        patcher = mock.patch.object(firebase, "_fetch_certs", return_value=CERTS)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = get_user_model().objects.create_user(
            firebase_uid="uid-1", nickname="ぴあ", school_level="middle", grade=2
        )

    def client_with(self, token):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return c

    def test_registered_user_gets_profile(self):
        res = self.client_with(make_token("uid-1")).get("/api/v1/users/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res.json(),
            {"id": self.user.id, "nickname": "ぴあ", "school_level": "middle", "grade": 2, "onboarding_completed": False},
        )

    def test_registered_user_can_use_other_apis(self):
        res = self.client_with(make_token("uid-1")).get("/api/v1/peers/me/")
        self.assertEqual(res.status_code, 200)

    def test_missing_token_is_401(self):
        res = APIClient().get("/api/v1/users/me/")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["code"], "UNAUTHORIZED")
        self.assertIn("Bearer", res["WWW-Authenticate"])

    def test_bad_tokens_are_401(self):
        now = int(time.time())
        for label, token in {
            "expired": make_token(exp=now - 120, iat=now - 3700),
            "other project": make_token(project="other-project"),
            "forged": make_token(key_pem=OTHER_KEY_PEM),
            "garbage": "not-a-token",
        }.items():
            with self.subTest(label):
                res = self.client_with(token).get("/api/v1/users/me/")
                self.assertEqual(res.status_code, 401)
                self.assertEqual(res.json()["code"], "INVALID_TOKEN")

    def test_malformed_header_is_401(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer a b")
        self.assertEqual(c.get("/api/v1/users/me/").status_code, 401)

    def test_disabled_account_is_401(self):
        self.user.is_active = False
        self.user.save()
        res = self.client_with(make_token("uid-1")).get("/api/v1/users/me/")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()["code"], "ACCOUNT_DISABLED")

    def test_unregistered_user_is_403_and_not_created(self):
        for path in ("/api/v1/users/me/", "/api/v1/peers/me/", "/api/v1/lessons/"):
            with self.subTest(path):
                res = self.client_with(make_token("new-uid")).get(path)
                self.assertEqual(res.status_code, 403)
                self.assertEqual(res.json(), {"code": "ONBOARDING_REQUIRED", "message": "初回設定をしてください。"})
        self.assertFalse(get_user_model().objects.filter(firebase_uid="new-uid").exists())


@override_settings(FIREBASE_PROJECT_ID=PROJECT)
class OnboardingTests(TestCase):
    BODY = {
        "nickname": " たろう ",
        "school_level": "middle",
        "grade": 1,
        "terms_version": "2026-11-01",
        "privacy_notice_version": "2026-11-01",
        "consent_confirmed": True,
    }

    def setUp(self):
        patcher = mock.patch.object(firebase, "_fetch_certs", return_value=CERTS)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.c = APIClient()
        self.c.credentials(HTTP_AUTHORIZATION=f"Bearer {make_token('new-uid')}")

    def post(self, body):
        return self.c.post("/api/v1/onboarding/complete/", body, format="json")

    def test_first_time_creates_user_and_peer(self):
        res = self.post(self.BODY)
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body["nickname"], "たろう")
        self.assertTrue(body["onboarding_completed"])
        user = get_user_model().objects.get(firebase_uid="new-uid")
        self.assertEqual(user.terms_version, "2026-11-01")
        self.assertIsNotNone(user.consented_at)
        self.assertTrue(Peer.objects.filter(owner=user).exists())
        # 登録したあとは、ほかの API も使える
        self.assertEqual(self.c.get("/api/v1/users/me/").status_code, 200)

    def test_second_time_returns_200_and_keeps_data(self):
        self.assertEqual(self.post(self.BODY).status_code, 201)
        res = self.post({**self.BODY, "nickname": "べつの名前"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["nickname"], "たろう")
        self.assertEqual(get_user_model().objects.filter(firebase_uid="new-uid").count(), 1)
        self.assertEqual(Peer.objects.count(), 1)

    def test_invalid_bodies_are_400_and_create_nothing(self):
        cases = {
            "no consent": ({"consent_confirmed": False}, "CONSENT_REQUIRED"),
            "consent as string": ({"consent_confirmed": "true"}, "CONSENT_REQUIRED"),
            "empty nickname": ({"nickname": "  "}, "INVALID_NICKNAME"),
            "long nickname": ({"nickname": "あ" * 41}, "INVALID_NICKNAME"),
            "bad school": ({"school_level": "elementary"}, "INVALID_SCHOOL_LEVEL"),
            "bad grade": ({"grade": 4}, "INVALID_GRADE"),
            "grade as bool": ({"grade": True}, "INVALID_GRADE"),
            "long version": ({"terms_version": "v" * 33}, "INVALID_CONSENT_VERSION"),
            "extra field": ({"is_staff": True}, "INVALID_FIELDS"),
        }
        for label, (change, code) in cases.items():
            with self.subTest(label):
                res = self.post({**self.BODY, **change})
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.json()["code"], code)
        self.assertFalse(get_user_model().objects.filter(firebase_uid="new-uid").exists())

    def test_get_does_not_register(self):
        res = self.c.get("/api/v1/onboarding/complete/")
        self.assertEqual(res.status_code, 405)
        self.assertFalse(get_user_model().objects.filter(firebase_uid="new-uid").exists())

    def test_requires_token(self):
        res = APIClient().post("/api/v1/onboarding/complete/", self.BODY, format="json")
        self.assertEqual(res.status_code, 401)


@override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:3000"])
class CorsTests(TestCase):
    def test_preflight_from_allowed_origin(self):
        res = self.client.options(
            "/api/v1/users/me/",
            HTTP_ORIGIN="http://localhost:3000",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization",
        )
        self.assertEqual(res.status_code, 204)
        self.assertEqual(res["Access-Control-Allow-Origin"], "http://localhost:3000")
        self.assertIn("Authorization", res["Access-Control-Allow-Headers"])

    def test_other_origin_gets_no_cors_headers(self):
        res = self.client.get("/api/v1/users/me/", HTTP_ORIGIN="https://evil.example")
        self.assertNotIn("Access-Control-Allow-Origin", res)
        self.assertIn("Origin", res["Vary"])

    def test_allowed_origin_on_normal_request(self):
        res = self.client.get("/api/v1/users/me/", HTTP_ORIGIN="http://localhost:3000")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res["Access-Control-Allow-Origin"], "http://localhost:3000")
