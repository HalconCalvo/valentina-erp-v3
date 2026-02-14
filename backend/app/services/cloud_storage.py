import os
from google.cloud import storage

# Configuración
BUCKET_NAME = "valentina-erp-v3-assets"
# Nombre del archivo que buscaremos
CREDENTIALS_FILENAME = "service_account.json"

def upload_to_gcs(file_obj, destination_blob_name, content_type="application/octet-stream"):
    """
    Sube un archivo a Google Cloud Storage.
    Busca las credenciales tanto en local como en la carpeta de secretos de Render.
    """
    try:
        # 1. BUSQUEDA INTELIGENTE DE LA LLAVE
        # Opción A: Estamos en tu Mac (carpeta actual)
        local_path = os.path.join(os.getcwd(), CREDENTIALS_FILENAME)
        
        # Opción B: Estamos en Render (carpeta de secretos)
        render_path = f"/etc/secrets/{CREDENTIALS_FILENAME}"
        
        final_path = None
        
        if os.path.exists(local_path):
            final_path = local_path
            # print(f"Usando llave LOCAL: {final_path}") # Debug opcional
        elif os.path.exists(render_path):
            final_path = render_path
            # print(f"Usando llave RENDER: {final_path}") # Debug opcional
        else:
            print(f"ERROR CRÍTICO: No encuentro {CREDENTIALS_FILENAME} en {local_path} ni en {render_path}")
            return None

        # 2. Conectar con la llave encontrada
        client = storage.Client.from_service_account_json(final_path)
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(destination_blob_name)

        # 3. Subir el archivo
        file_obj.seek(0)
        blob.upload_from_file(file_obj, content_type=content_type)

        return blob.public_url

    except Exception as e:
        print(f"Error subiendo a GCS: {e}")
        return None