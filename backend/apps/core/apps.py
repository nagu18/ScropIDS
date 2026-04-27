from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
    verbose_name = "ScropIDS Core"

    def ready(self) -> None:
        self._patch_django_template_context_copy()
        from . import signals  # noqa: F401

    @staticmethod
    def _patch_django_template_context_copy() -> None:
        from django.template.context import BaseContext

        if getattr(BaseContext, "_scropids_copy_patch", False):
            return

        def _safe_copy(self):
            duplicate = object.__new__(self.__class__)
            duplicate.__dict__ = self.__dict__.copy()
            duplicate.dicts = self.dicts[:]
            return duplicate

        BaseContext.__copy__ = _safe_copy
        BaseContext._scropids_copy_patch = True
