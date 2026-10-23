"""Transporte HTTP/1.1 para PostgREST con el SDK Supabase fijado en requirements.

Evita los errores de estado de streams HTTP/2 observados al reutilizar el pool
desde varias consultas simultáneas del worker. Conserva TLS, cabeceras y límites.
"""
import httpx
from postgrest import SyncPostgrestClient
from supabase import Client
from supabase.lib.client_options import ClientOptions


class Http1PostgrestClient(SyncPostgrestClient):
    def create_session(self, base_url, headers, timeout, verify=True, proxy=None):
        return httpx.Client(base_url=base_url, headers=headers, timeout=timeout,
                            verify=verify, proxy=proxy, follow_redirects=True, http2=False)


class WorkerSupabaseClient(Client):
    @staticmethod
    def _init_postgrest_client(rest_url, headers, schema, timeout=120, verify=True, proxy=None):
        return Http1PostgrestClient(rest_url, headers=headers, schema=schema,
                                   timeout=timeout, verify=verify, proxy=proxy)


def create_worker_client(url, key):
    return WorkerSupabaseClient(url, key, options=ClientOptions(auto_refresh_token=False, persist_session=False))
