import os
from google.cloud import storage

# Configuración
BUCKET_NAME = "valentina-erp-v3-assets"
CREDENTIALS_FILE = "service_account.json"

def upload_to_gcs(file_obj, destination_blob_name, content_type="application/octet-stream"):
    """
    Sube un archivo a Google Cloud Storage.
    Recibe:
      - file_obj: El archivo binario (file.file).
      - destination_blob_name: Nombre final en la nube (ej. logos/mi_logo.png).
      - content_type: Tipo de archivo (ej. image/png o application/pdf).
    """
    try:
        # Autenticación
        current_path = os.getcwd()
        json_path = os.path.join(current_path, CREDENTIALS_FILE)
        
        # Validamos que exista la llave antes de intentar
        if not os.path.exists(json_path):
            print(f"ERROR CRÍTICO: No se encuentra {json_path}")
            return None

        client = storage.Client.from_service_account_json(json_path)
        bucket = client.bucket(BUCKET_NAME)
        blob = bucket.blob(destination_blob_name)

        # Subir el archivo con su TIPO correcto
        file_obj.seek(0)
        blob.upload_from_file(file_obj, content_type=content_type)

        return blob.public_url

    except Exception as e:
        print(f"Error subiendo a GCS: {e}")
        return None