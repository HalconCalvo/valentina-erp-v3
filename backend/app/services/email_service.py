import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.generator import BytesGenerator
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
        f"Estimado proveedor {provider_name},\r\n\r\n"
        f"Adjuntamos la Orden de Compra {folio} para su atencion.\r\n"
        f"Por favor confirme de recibido.\r\n\r\n"
        f"Saludos,\r\n{company_name}"
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

    buf = BytesIO()
    gen = BytesGenerator(buf, mangle_from_=False)
    gen.flatten(msg)
    msg_bytes = buf.getvalue().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')

    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    # Puerto 465 SSL directo
    with smtplib.SMTP_SSL(smtp_host, 465, context=context) as server:
        server.login(smtp_email, smtp_password)
        server.sendmail(smtp_email, to_email, msg_bytes)
