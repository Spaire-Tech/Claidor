"""Simeon-on-Simeon platform billing.

Submodules are deliberately not re-exported at the package level:
importing `simeon.platform.billing` or `simeon.platform.fee_sync` from
here would pull entitlements and subscription/customer machinery into
`simeon/platform/__init__.py`, which both
`simeon/platform/fee_sync.py` and `simeon/entitlements/service.py`
indirectly depend on — producing a circular import at module load.

Always import directly from the submodule:

    from simeon.platform.service import platform
    from simeon.platform.billing import platform_billing
    from simeon.platform.fee_sync import platform_fee_sync
    from simeon.platform.management import platform_management
    from simeon.platform.upgrade import platform_upgrade
"""
