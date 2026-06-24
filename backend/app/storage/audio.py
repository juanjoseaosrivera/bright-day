"""Object-storage adapter for session audio + signed URLs (stub).

Raw audio lives only in object storage (Supabase Storage); the database holds
metadata and a URL reference. Signed-URL issuance is wired in a later slice.
"""
