from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase


class UserTests(TestCase):
    def test_create_user_with_profile_and_unusable_password(self):
        user = get_user_model().objects.create_user(
            firebase_uid="firebase-uid", nickname="ぴあ", school_level="middle", grade=1
        )
        self.assertEqual(user.firebase_uid, "firebase-uid")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.grade, 1)

    def test_duplicate_uid_is_rejected_by_database(self):
        User = get_user_model()
        User.objects.create_user(firebase_uid="duplicate")
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(firebase_uid="duplicate")

    def test_blank_uid_is_rejected(self):
        User = get_user_model()
        with self.assertRaises(ValueError):
            User.objects.create_user(firebase_uid=" ")
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create(firebase_uid="")

    def test_create_superuser_requires_password_and_privileges(self):
        User = get_user_model()
        with self.assertRaises(ValueError):
            User.objects.create_superuser(firebase_uid="admin")
        with self.assertRaises(ValueError):
            User.objects.create_superuser(firebase_uid="admin", password="test", is_staff=False)
        admin = User.objects.create_superuser(firebase_uid="admin", password="test")
        self.assertTrue(admin.is_staff and admin.is_superuser)
        self.assertTrue(admin.check_password("test"))
