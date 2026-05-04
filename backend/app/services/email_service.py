import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from io import BytesIO


def send_purchase_order_email(
    smtp_host: str,
    smtp_email: str,
    smtp_password: str,
    to_email: str,
    provider_name: str,
    folio: str,
    pdf_buffer: BytesIO,
    company_name: str = "Valentina"
) -> None:
    msg = MIMEMultipart()
    msg["From"] = smtp_email
    msg["To"] = to_email
    msg["Subject"] = f"Orden de Compra {folio} — {company_name}"

    body = (
        f"Estimado proveedor {provider_name},\n\n"
        f"Adjuntamos la Orden de Compra {folio} para su atención.\n"
        f"Por favor confírmenos de recibido.\n\n"
        f"Saludos,\n{company_name}"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    part = MIMEBase("application", "octet-stream")
    pdf_buffer.seek(0)
    part.set_payload(pdf_buffer.read())
    encoders.encode_base64(part)
    part.add_header(
        "Content-Disposition",
        f'attachment; filename="OC_{folio}.pdf"'
    )
    msg.attach(part)

    port = 587
    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, port) as server:
        server.ehlo()
        server.starttls(context=context)
        server.login(smtp_email, smtp_password)
        server.sendmail(smtp_email, to_email, msg.as_string())
