"""Firebase の ID トークンを確かめる（Issue #11）。

確かめること（Firebase の公式の手順に合わせる）：
- 署名：Google が公開している鍵（securetoken@system.gserviceaccount.com）で、RS256 の署名が正しい
- 対象（aud）が自分たちのプロジェクト ID、発行者（iss）が https://securetoken.google.com/<プロジェクト ID>
- 有効期限（exp）が切れていない、発行時刻（iat）・ログイン時刻（auth_time）が未来でない
- sub（= Firebase の UID）が空でなく、128文字以内

失効（ログアウトやパスワード変更でトークンを無効にしたか）の確認はしない。
トークンの有効期限が1時間と短く、毎回 Google に問い合わせると遅くなるため（MVP の範囲、README に記載）。
"""

import base64
import json
import re
import threading
import time
import urllib.request

from django.conf import settings
from google.auth import exceptions as google_exceptions
from google.auth import jwt

CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
CLOCK_SKEW_SECONDS = 10


class InvalidToken(Exception):
    """トークンが正しくない（理由はログに出さず、401 にする）"""


_cache = {"certs": None, "expires": 0.0}
_lock = threading.Lock()


def _fetch_certs():
    """公開鍵を取ってくる。Cache-Control の max-age のあいだは使い回す。"""
    now = time.time()
    with _lock:
        if _cache["certs"] and _cache["expires"] > now:
            return _cache["certs"]
        with urllib.request.urlopen(CERTS_URL, timeout=5) as res:
            certs = json.loads(res.read().decode("utf-8"))
            match = re.search(r"max-age=(\d+)", res.headers.get("Cache-Control", ""))
        _cache["certs"] = certs
        _cache["expires"] = now + (int(match.group(1)) if match else 3600)
        return certs


def _header(token: str) -> dict:
    try:
        head = token.split(".")[0]
        return json.loads(base64.urlsafe_b64decode(head + "=" * (-len(head) % 4)))
    except (ValueError, IndexError):
        raise InvalidToken("malformed") from None


def verify_id_token(token: str, *, certs=None, project_id=None) -> dict:
    """正しければトークンの中身（claims）を返す。だめなら InvalidToken。"""
    project_id = project_id or settings.FIREBASE_PROJECT_ID
    if not project_id:
        raise InvalidToken("FIREBASE_PROJECT_ID is not set")
    header = _header(token)
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise InvalidToken("bad header")
    try:
        certs = certs if certs is not None else _fetch_certs()
    except OSError:
        raise InvalidToken("certs unavailable") from None
    if header["kid"] not in certs:
        raise InvalidToken("unknown key")
    try:
        claims = jwt.decode(token, certs=certs, audience=project_id, clock_skew_in_seconds=CLOCK_SKEW_SECONDS)
    except (google_exceptions.GoogleAuthError, ValueError):
        raise InvalidToken("signature or claims") from None
    if claims.get("iss") != f"https://securetoken.google.com/{project_id}":
        raise InvalidToken("issuer")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub or len(sub) > 128:
        raise InvalidToken("subject")
    if float(claims.get("auth_time", 0)) > time.time() + CLOCK_SKEW_SECONDS:
        raise InvalidToken("auth_time")
    return claims
