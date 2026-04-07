import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from dotenv import load_dotenv

load_dotenv()

class EmailService:
    @staticmethod
    def send_purchase_order(to_email, folio, provider_name, pdf_buffer):
        # Leemos las llaves del .env
        smtp_server = os.getenv("SMTP_SERVER")
        smtp_port = int(os.getenv("SMTP_PORT", 587))
        smtp_user = os.getenv("SMTP_USER")
        smtp_pass = os.getenv("SMTP_PASSWORD")
        from_name = os.getenv("SMTP_FROM_NAME")

        # Creamos el paquete
        msg = MIMEMultipart()
        msg['From'] = f"{from_name} <{smtp_user}>"
        msg['To'] = to_email
        msg['Subject'] = f"ORDEN DE COMPRA: {folio} - INCAMEX"

        # Cuerpo del mensaje
        body = f"""
        Estimado equipo de {provider_name},

        Adjunto a este correo enviamos la Orden de Compra oficial con folio {folio}.
        Agradecemos confirmen de recibido y nos indiquen la fecha estimada de entrega.

        Saludos cordiales,
        Departamento de Compras - INCAMEX
        """
        msg.attach(MIMEText(body, 'plain'))

        # Adjuntamos el PDF desde la memoria RAM
        pdf_buffer.seek(0)
        part = MIMEApplication(pdf_buffer.read(), Name=f"OC_{folio}.pdf")
        part['Content-Disposition'] = f'attachment; filename="OC_{folio}.pdf"'
        msg.attach(part)

        # ¡El cartero sale a GoDaddy!
        try:
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls() # Seguridad TLS
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as e:
            print(f"Error al enviar correo: {e}")
            return False