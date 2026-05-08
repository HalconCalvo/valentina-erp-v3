import base64
import requests
from io import BytesIO


def send_purchase_order_email(
    smtp_host: str,
    smtp_email: str,
    smtp_password: str,
    to_email: str,
    provider_name: str,
    folio: str,
    pdf_buffer: BytesIO = None,
    company_name: str = "Valentina"
) -> None:

    body = (
        f"Estimado proveedor {provider_name},\n\n"
        f"Adjuntamos la Orden de Compra {folio} para su atencion.\n"
        f"Por favor confirme de recibido.\n\n"
        f"Saludos,\n{company_name}"
    )

    payload = {
        "sender": {
            "name": company_name,
            "email": smtp_email
        },
        "to": [{"email": to_email}],
        "cc": [{"email": smtp_email}],
        "subject": f"Orden de Compra {folio} — {company_name}",
        "textContent": body
    }

    if pdf_buffer is not None:
        pdf_buffer.seek(0)
        pdf_b64 = base64.b64encode(pdf_buffer.read()).decode('utf-8')
        payload["attachment"] = [
            {
                "name": f"OC_{folio}.pdf",
                "content": pdf_b64
            }
        ]

    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": smtp_password
        },
        json=payload,
        timeout=30
    )

    if response.status_code not in (200, 201, 202):
        raise Exception(
            f"Brevo API error {response.status_code}: {response.text}"
        )
