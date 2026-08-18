"""diary — dependencies.

No domain-specific dependencies. Entry ownership is enforced inside
service.py on every fetch. Use CurrentUser from auth.dependencies and
get_db from db.session directly in router.py.
"""
