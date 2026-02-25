import os
from io import BytesIO
from urllib.request import urlopen  # <--- VITAL PARA LEER DE LA NUBE
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_RIGHT, TA_LEFT
from reportlab.lib.utils import ImageReader

class PDFGenerator:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        
        # Estilos personalizados
        self.styles.add(ParagraphStyle(
            name='NormalSmall', 
            parent=self.styles['Normal'], 
            fontSize=9, 
            leading=11
        ))
        
        self.styles.add(ParagraphStyle(
            name='BodyTextCustom', 
            parent=self.styles['Normal'], 
            fontSize=10, 
            leading=13, 
            spaceAfter=6,
            alignment=TA_LEFT
        ))
        
        self.styles.add(ParagraphStyle(
            name='Conditions', 
            parent=self.styles['Normal'], 
            fontSize=8, 
            leading=10, 
            leftIndent=10, 
            spaceAfter=2
        ))

        self.styles.add(ParagraphStyle(
            name='DateStyle',
            parent=self.styles['Normal'], 
            fontSize=10, 
            alignment=TA_RIGHT
        ))

    def _draw_footer(self, canvas, doc, config):
        canvas.saveState()
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor("#555555"))
        
        # Línea divisoria
        canvas.setStrokeColor(colors.lightgrey)
        canvas.line(40, 50, LETTER[0]-40, 50) 

        # Datos de la empresa
        company_name = getattr(config, 'company_name', '')
        company_address = getattr(config, 'company_address', '') # Asumiendo que existe en el modelo o se agregará
        company_phone = getattr(config, 'company_phone', '')     # Asumiendo que existe
        company_email = getattr(config, 'company_email', '')     # Asumiendo que existe
        company_website = getattr(config, 'company_website', '') # Asumiendo que existe

        footer_text = f"{company_name}"
        if company_address:
            footer_text += f" | {company_address}"
        
        contact_text = ""
        contact_parts = []
        if company_phone: contact_parts.append(f"Tel: {company_phone}")
        if company_email: contact_parts.append(f"Email: {company_email}")
        if company_website: contact_parts.append(f"Web: {company_website}")
        
        contact_text = " | ".join(contact_parts)

        # Centrado
        canvas.drawCentredString(LETTER[0]/2.0, 35, footer_text)
        canvas.drawCentredString(LETTER[0]/2.0, 25, contact_text)
        
        # Paginación
        page_num_text = f"Página {doc.page}"
        canvas.drawRightString(LETTER[0] - 40, 25, page_num_text)
        
        canvas.restoreState()

    def generate_quote_pdf(self, order, client, config, seller_name="Departamento de Ventas", seller_email="") -> BytesIO:
        buffer = BytesIO()
        
        doc = SimpleDocTemplate(
            buffer, pagesize=LETTER,
            rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=60
        )
        
        elements = []
        
        # --- 1. FECHA ---
        months = {
            1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
            7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre"
        }
        
        try:
            day = order.created_at.day
            month = months[order.created_at.month]
            year = order.created_at.year
            date_str = f"Mérida, Yucatán a {day} de {month} de {year}"
        except:
            date_str = "Fecha no disponible"

        # --- 2. ENCABEZADO Y LOGO (VERSIÓN CLOUD) ---
        logo_image_obj = None # Variable para guardar la imagen en RAM
        
        if hasattr(config, 'logo_path') and config.logo_path:
            logo_url = config.logo_path
            
            # CASO 1: Es una URL de Google Cloud (http/https)
            if logo_url.startswith("http"):
                try:
                    # Descargamos la imagen a la memoria RAM (BytesIO)
                    with urlopen(logo_url) as response:
                        img_data = response.read()
                    logo_image_obj = BytesIO(img_data)
                except Exception as e:
                    print(f"Advertencia: No se pudo descargar el logo desde la nube: {e}")
                    logo_image_obj = None
            
            # CASO 2: Es un archivo local (Desarrollo local)
            elif os.path.exists(logo_url):
                 logo_image_obj = logo_url # ReportLab acepta rutas de archivo directas

        header_content = []
        company_title = getattr(config, 'company_name', 'Empresa')
        
        if logo_image_obj:
            try:
                # 2. LÓGICA DE ESCALADO PROPORCIONAL
                img_reader = ImageReader(logo_image_obj)
                orig_w, orig_h = img_reader.getSize()
                aspect = orig_h / float(orig_w)

                # Caja máxima
                max_w = 2.5 * inch
                max_h = 1.2 * inch

                new_w = max_w
                new_h = new_w * aspect

                if new_h > max_h:
                    new_h = max_h
                    new_w = new_h / aspect

                # Si es un BytesIO, necesitamos regresar el cursor al inicio para que Image lo lea
                if isinstance(logo_image_obj, BytesIO):
                    logo_image_obj.seek(0)

                img = Image(logo_image_obj, width=new_w, height=new_h)
                img.hAlign = 'LEFT'
                header_content.append([img, Paragraph(date_str, self.styles['DateStyle'])])
            except Exception as e:
                # Si falla la imagen, ponemos texto
                print(f"Error procesando imagen para PDF: {e}")
                header_content.append([
                    Paragraph(f"<b>{company_title}</b>", self.styles['Heading3']), 
                    Paragraph(date_str, self.styles['DateStyle'])
                ])
        else:
            header_content.append([
                Paragraph(f"<b>{company_title}</b>", self.styles['Heading3']), 
                Paragraph(date_str, self.styles['DateStyle'])
            ])

        header_table = Table(header_content, colWidths=[3.5*inch, 3.5*inch])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 20))

        # --- 3. CLIENTE ---
        client_name = getattr(client, 'full_name', '') or "Cliente General"
        client_contact = getattr(client, 'contact_name', '') or 'Quien corresponda'
        
        client_block = [
            Paragraph(f"<b>ATENCIÓN:</b> {client_contact}", self.styles['Normal']),
            Paragraph(f"<b>CLIENTE:</b> {client_name}", self.styles['Normal']),
        ]
        
        if hasattr(order, 'project_name') and order.project_name:
             client_block.append(Paragraph(f"<b>PROYECTO:</b> {order.project_name}", self.styles['NormalSmall']))
        
        elements.extend(client_block)
        elements.append(Spacer(1, 20))

        # --- 4. NOTAS ---
        intro_text = order.notes if (hasattr(order, 'notes') and order.notes) else "Por este medio le envío la cotización solicitada:"
        if intro_text:
            for line in intro_text.splitlines():
                if line.strip():
                    elements.append(Paragraph(line, self.styles['BodyTextCustom']))
        
        elements.append(Spacer(1, 10))

        # --- 5. TABLA DETALLADA ---
        data = [['CONCEPTO / DESCRIPCIÓN', 'CANT.', 'P. UNIT.', 'IMPORTE']]
        
        if hasattr(order, 'items'):
            for item in order.items:
                desc = f"<b>{item.product_name}</b>"
                p_desc = Paragraph(desc, self.styles['NormalSmall'])
                qty = item.quantity
                unit_price = item.unit_price
                subtotal = item.subtotal_price
                
                data.append([
                    p_desc, 
                    str(qty), 
                    f"${unit_price:,.2f}", 
                    f"${subtotal:,.2f}"
                ])

        subtotal_val = getattr(order, 'subtotal', 0) or 0.0
        tax_val = getattr(order, 'tax_amount', 0) or 0.0
        total_val = getattr(order, 'total_price', 0) or 0.0

        data.append(['', '', 'SUBTOTAL:', f"${subtotal_val:,.2f}"])
        data.append(['', '', 'IVA:', f"${tax_val:,.2f}"])
        data.append(['', '', 'TOTAL:', f"${total_val:,.2f}"])

        col_widths = [4.1*inch, 0.8*inch, 1.25*inch, 1.25*inch]
        t = Table(data, colWidths=col_widths)
        
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#f8fafc")),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 9),
            ('LINEBELOW', (0,0), (-1,0), 1, colors.black),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ALIGN', (0,0), (0,-1), 'LEFT'),
            ('ALIGN', (1,0), (1,-1), 'CENTER'),
            ('ALIGN', (2,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,1), (-1,-1), 9),
            ('LINEABOVE', (2, -3), (-1, -3), 0.5, colors.black),
            ('FONTNAME', (2,-3), (-1,-2), 'Helvetica'),
            ('FONTNAME', (2,-1), (-1,-1), 'Helvetica-Bold'),
            ('FONTSIZE', (2,-1), (-1,-1), 10),
            ('TOPPADDING', (2,-3), (-1,-1), 3),
            ('BOTTOMPADDING', (2,-3), (-1,-1), 3),
        ]))
        
        elements.append(t)
        elements.append(Spacer(1, 20))

        # --- 6. CONDICIONES ---
        conditions_text = getattr(order, 'conditions', None)
        if conditions_text and len(conditions_text.strip()) > 0:
            elements.append(Paragraph("<b>CONDICIONES COMERCIALES:</b>", self.styles['NormalSmall']))
            elements.append(Spacer(1, 3))
            
            for line in conditions_text.splitlines():
                line = line.strip()
                if line:
                    lower_line = line.lower()
                    if "sin otro en particular" in lower_line or "atentamente" in lower_line:
                         elements.append(Spacer(1, 8))
                         elements.append(Paragraph(line, self.styles['BodyTextCustom']))
                    else:
                        txt = line
                        if not txt.startswith("•") and not txt.startswith("-") and not txt.startswith("·"):
                            txt = f"• {txt}"
                        elements.append(Paragraph(txt, self.styles['Conditions']))
        
        elements.append(Spacer(1, 30))

        # --- 7. FIRMA ---
        signature_block = [
            Spacer(1, 20),
            Paragraph("<b>Atentamente,</b>", self.styles['Normal']),
            Spacer(1, 35),
            Paragraph("_________________________________________", self.styles['Normal']),
            Paragraph(f"<b>{seller_name}</b>", self.styles['Normal'])
        ]
        
        # Si el vendedor tiene correo, lo ponemos justo debajo de su nombre en un tono gris elegante
        if seller_email:
            signature_block.append(Paragraph(f"<font size=9 color='#555555'>{seller_email}</font>", self.styles['Normal']))
            
        # Nombre de la empresa al final
        signature_block.append(Paragraph(f"<font size=8 color='#888888'>{company_title}</font>", self.styles['Normal']))
        
        elements.append(KeepTogether(signature_block))

        doc.build(elements, onFirstPage=lambda c, d: self._draw_footer(c, d, config), 
                  onLaterPages=lambda c, d: self._draw_footer(c, d, config))
        
        buffer.seek(0)
        return buffer