import os
import ssl 
from io import BytesIO
from urllib.request import urlopen
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
        
        self.styles.add(ParagraphStyle(
            name='CenterSignature',
            parent=self.styles['NormalSmall'],
            alignment=1 # Center
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
        company_address = getattr(config, 'company_address', '')
        company_phone = getattr(config, 'company_phone', '')
        company_email = getattr(config, 'company_email', '')
        company_website = getattr(config, 'company_website', '')

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

        # --- 2. ENCABEZADO Y LOGO ---
        logo_image_obj = None 
        
        if hasattr(config, 'logo_path') and config.logo_path:
            logo_url = config.logo_path
            if logo_url.startswith("http"):
                try:
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    
                    with urlopen(logo_url, context=ctx) as response:
                        img_data = response.read()
                    logo_image_obj = BytesIO(img_data)
                except Exception as e:
                    print(f"Advertencia: No se pudo descargar el logo desde la nube: {e}")
                    logo_image_obj = None
            elif os.path.exists(logo_url):
                 logo_image_obj = logo_url

        header_content = []
        company_title = getattr(config, 'company_name', 'Empresa')
        
        if logo_image_obj:
            try:
                img_reader = ImageReader(logo_image_obj)
                orig_w, orig_h = img_reader.getSize()
                aspect = orig_h / float(orig_w)

                max_w = 2.5 * inch
                max_h = 1.2 * inch

                new_w = max_w
                new_h = new_w * aspect

                if new_h > max_h:
                    new_h = max_h
                    new_w = new_h / aspect

                if isinstance(logo_image_obj, BytesIO):
                    logo_image_obj.seek(0)

                img = Image(logo_image_obj, width=new_w, height=new_h)
                img.hAlign = 'LEFT'
                header_content.append([img, Paragraph(date_str, self.styles['DateStyle'])])
            except Exception as e:
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
        intro_text = order.notes if (hasattr(order, 'notes') and order.notes) else ""
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
        
        if seller_email:
            signature_block.append(Paragraph(f"<font size=9 color='#555555'>{seller_email}</font>", self.styles['Normal']))
            
        signature_block.append(Paragraph(f"<font size=8 color='#888888'>{company_title}</font>", self.styles['Normal']))
        
        elements.append(KeepTogether(signature_block))

        doc.build(elements, onFirstPage=lambda c, d: self._draw_footer(c, d, config), 
                  onLaterPages=lambda c, d: self._draw_footer(c, d, config))
        
        buffer.seek(0)
        return buffer

    # ==========================================================
    # EL NUEVO GENERADOR DE ORDEN DE COMPRA
    # ==========================================================
    def generate_po_pdf(self, order, provider, config) -> BytesIO:
        from datetime import datetime
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=LETTER,
            rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=60
        )
        elements = []
        
        # --- 1. ENCABEZADO CON FOLIO Y LOGO ---
        try:
            date_str = order.created_at.strftime("%d/%m/%Y")
        except:
            date_str = datetime.now().strftime("%d/%m/%Y")

        folio = getattr(order, 'folio', 'S/F')
        
        logo_image_obj = None
        if hasattr(config, 'logo_path') and config.logo_path:
            logo_url = config.logo_path
            if logo_url.startswith("http"):
                try:
                    ctx = ssl.create_default_context()
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                    
                    with urlopen(logo_url, context=ctx) as response:
                        img_data = response.read()
                    logo_image_obj = BytesIO(img_data)
                except Exception as e:
                    print(f"Advertencia: No se pudo descargar el logo: {e}")
            elif os.path.exists(logo_url):
                 logo_image_obj = logo_url

        header_content = []
        company_title = getattr(config, 'company_name', 'INCAMEX')

        text_right = [
            Paragraph(f"<font size=14><b>ORDEN DE COMPRA</b></font>", self.styles['DateStyle']),
            Paragraph(f"<font color='#d32f2f'><b>Folio: {folio}</b></font>", self.styles['DateStyle']),
            Paragraph(f"Fecha: {date_str}", self.styles['DateStyle'])
        ]

        if logo_image_obj:
            try:
                img_reader = ImageReader(logo_image_obj)
                orig_w, orig_h = img_reader.getSize()
                aspect = orig_h / float(orig_w)
                max_w, max_h = 2.5 * inch, 1.2 * inch
                new_w, new_h = max_w, max_w * aspect
                if new_h > max_h:
                    new_h, new_w = max_h, max_h / aspect

                if isinstance(logo_image_obj, BytesIO):
                    logo_image_obj.seek(0)

                img = Image(logo_image_obj, width=new_w, height=new_h)
                img.hAlign = 'LEFT'
                header_content.append([img, text_right])
            except Exception as e:
                header_content.append([Paragraph(f"<b>{company_title}</b>", self.styles['Heading3']), text_right])
        else:
            header_content.append([Paragraph(f"<b>{company_title}</b>", self.styles['Heading3']), text_right])

        header_table = Table(header_content, colWidths=[3.5*inch, 3.5*inch])
        header_table.setStyle(TableStyle([('ALIGN', (1,0), (1,0), 'RIGHT'), ('VALIGN', (0,0), (-1,-1), 'TOP')]))
        elements.append(header_table)
        elements.append(Spacer(1, 15))

        # --- 2. BLOQUE DE PROVEEDOR Y ENTREGA ---
        provider_info = [
            Paragraph("<b>DATOS DEL PROVEEDOR:</b>", self.styles['NormalSmall']),
            Paragraph(getattr(provider, 'business_name', 'S/N'), self.styles['Normal']),
            Paragraph(f"RFC: {getattr(provider, 'rfc_tax_id', 'S/RFC') if hasattr(provider, 'rfc_tax_id') else getattr(provider, 'rfc', 'S/RFC')}", self.styles['NormalSmall']),
            Paragraph(f"Contacto: {getattr(provider, 'contact_name', '') or 'S/C'}", self.styles['NormalSmall']),
        ]
        
        shipping_info = [
            Paragraph("<b>ENTREGAR EN / FACTURAR A:</b>", self.styles['NormalSmall']),
            Paragraph(company_title, self.styles['Normal']),
            Paragraph(f"RFC: {getattr(config, 'company_rfc', '') or 'S/RFC'}", self.styles['NormalSmall']),
            Paragraph(getattr(config, 'company_address', 'Dirección de Fábrica'), self.styles['NormalSmall']),
        ]

        info_table = Table([[provider_info, shipping_info]], colWidths=[3.5*inch, 3.5*inch])
        info_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
        elements.append(info_table)
        elements.append(Spacer(1, 20))

        # --- 3. TABLA DE MATERIALES ---
        data = [['SKU', 'DESCRIPCIÓN DEL MATERIAL', 'CANT.', 'P. UNIT', 'TOTAL']]
        
        subtotal_calc = 0.0
        
        for item in getattr(order, 'items', []):
            sku = item.material.sku if hasattr(item, 'material') and item.material else getattr(item, 'sku', "S/S")
            
            desc_text = getattr(item, 'custom_description', None)
            if not desc_text and hasattr(item, 'material') and item.material:
                desc_text = item.material.name
            desc_text = desc_text or "Material S/N"
            
            qty = getattr(item, 'quantity_ordered', 0.0)
            if qty is None: qty = 0.0
            
            cost = getattr(item, 'expected_unit_cost', 0.0)
            if cost is None: cost = 0.0
            
            row_total = float(qty) * float(cost)
            subtotal_calc += row_total
            
            data.append([
                Paragraph(sku, self.styles['NormalSmall']),
                Paragraph(desc_text, self.styles['NormalSmall']),
                str(qty),
                f"${float(cost):,.2f}",
                f"${row_total:,.2f}"
            ])

        iva = subtotal_calc * 0.16
        total = subtotal_calc + iva

        data.append(['', '', '', 'SUBTOTAL:', f"${subtotal_calc:,.2f}"])
        data.append(['', '', '', 'IVA (16%):', f"${iva:,.2f}"])
        data.append(['', '', '', 'TOTAL NETO:', f"${total:,.2f}"])

        t = Table(data, colWidths=[1.0*inch, 3.0*inch, 0.7*inch, 1.1*inch, 1.2*inch])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#e2e8f0")),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('LINEBELOW', (0,0), (-1,0), 1, colors.black),
            ('ALIGN', (2,0), (-1,-1), 'CENTER'),
            ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('FONTNAME', (3,-3), (4,-1), 'Helvetica-Bold'), 
            
            # >>> AQUÍ ESTÁ LA MAGIA PARA ALINEAR TEXTOS MULTILÍNEA HACIA ARRIBA <<<
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            
            # Espaciado normal para las filas de productos
            ('TOPPADDING', (0,0), (-1,-4), 6),
            ('BOTTOMPADDING', (0,0), (-1,-4), 6),
            
            # Espaciado COMPRIMIDO para las últimas 3 filas (Subtotal, IVA, Total)
            ('TOPPADDING', (0,-3), (-1,-1), 1),
            ('BOTTOMPADDING', (0,-3), (-1,-1), 1),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 25))

        # --- 4. NOTAS E INSTRUCCIONES ---
        elements.append(Paragraph("<b>INSTRUCCIONES IMPORTANTES:</b>", self.styles['NormalSmall']))
        elements.append(Paragraph("• Favor de hacer referencia a este número de Folio de OC en su Factura.", self.styles['Conditions']))
        elements.append(Paragraph("• Horario de recepción de almacén: Lunes a Viernes de 8:00 AM a 5:00 PM.", self.styles['Conditions']))
        elements.append(Paragraph("• Indispensable presentar factura original y copia de esta OC al entregar.", self.styles['Conditions']))
        
        # --- 5. FIRMAS DUALES (ELABORÓ Y AUTORIZÓ) ---
        auth_by = getattr(order, 'authorized_by', None)
        if not auth_by:
            auth_by = "PENDIENTE DE FIRMA"
            
        created_by = getattr(order, 'created_by', "SISTEMA")
            
        elements.append(Spacer(1, 40))
        
        firma_elaboro = [
            Paragraph("_________________________________________", self.styles['CenterSignature']),
            Paragraph(f"<b>ELABORADO POR:</b><br/>{created_by}", self.styles['CenterSignature']),
        ]
        
        firma_autorizo = [
            Paragraph("_________________________________________", self.styles['CenterSignature']),
            Paragraph(f"<b>AUTORIZADO POR:</b><br/>{auth_by}", self.styles['CenterSignature']),
        ]
        
        firmas_table = Table([[firma_elaboro, firma_autorizo]], colWidths=[3.5*inch, 3.5*inch])
        firmas_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        
        elements.append(KeepTogether(firmas_table))

        doc.build(elements, onFirstPage=lambda c, d: self._draw_footer(c, d, config), 
                  onLaterPages=lambda c, d: self._draw_footer(c, d, config))
        
        buffer.seek(0)
        return buffer