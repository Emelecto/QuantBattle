# QuantBattle worker — imagen para Railway / Render / cualquier registry OCI
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Dependencias del sistema para pandas/numpy/compilación de wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn
# Asegurar PyJWT (no el paquete 'jwt' viejo que colisiona con el import y no soporta ES256)
RUN pip uninstall -y jwt PyJWT 2>/dev/null; pip install --force-reinstall --no-cache-dir "PyJWT[cors]==2.9.0"

COPY . .

EXPOSE 8000

# Uvicorn detrás de gunicorn: UN solo worker.
# motivo: el plan free/starter de Render topea a 512MB RAM. El stack de ML
# (pandas/scipy/FastAPI) pesa ~157MB por proceso; con 2 workers (~314MB
# residentes solo al arrancar) no quedaba margen y el scoring de submissions
# ML (42k filas) disparaba OOM -> server_failed -> reinicios. Un worker
# single-thread es suficiente (GIL; el motor de backtest ya es single-thread).
# Usamos shell form (sh -c) para que $PORT se expanda con la variable de
# entorno que inyecta Render/Vercel (sin llaves para evitar el error '${PORT').
CMD sh -c "gunicorn main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8000} --workers 1 --timeout 300"
