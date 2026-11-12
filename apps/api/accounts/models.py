from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, firebase_uid, password=None, **extra_fields):
        if not firebase_uid or not firebase_uid.strip():
            raise ValueError("A Firebase UID is required")
        user = self.model(firebase_uid=firebase_uid, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, firebase_uid, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_staff=True and is_superuser=True")
        if not password:
            raise ValueError("Superuser must have a password")
        return self.create_user(firebase_uid, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class SchoolLevel(models.TextChoices):
        MIDDLE = "middle", "中学校"
        HIGH = "high", "高校"

    firebase_uid = models.CharField(max_length=128, unique=True)
    nickname = models.CharField(max_length=40, blank=True)
    school_level = models.CharField(max_length=6, choices=SchoolLevel.choices, blank=True)
    grade = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(3)])
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # 初回設定で同意した規約・データの扱いの説明の版と日時。同意していなければ空
    terms_version = models.CharField(max_length=32, blank=True)
    privacy_notice_version = models.CharField(max_length=32, blank=True)
    consented_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()
    USERNAME_FIELD = "firebase_uid"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [models.CheckConstraint(condition=~models.Q(firebase_uid__regex=r"^\s*$"), name="accounts_user_uid_not_blank")]

    def __str__(self):
        return self.firebase_uid

    @property
    def onboarding_completed(self):
        return self.consented_at is not None
