/**
 * Genera el PDF del contrato firmado a partir de los bloques de
 * shared/contract-content.cjs + los datos del cliente/alumno + la imagen de
 * la firma. Devuelve un Buffer.
 *
 * No se incluye logo (mantenemos el PDF ligero y robusto en serverless).
 */
const PDFDocument = require('pdfkit');
const { VARIANTS, variantKey, fill } = require('../shared/contract-content.cjs');

// Colores corporativos (mirror de app.jsx)
const NAVY = '#1B2F6E';
const SLATE = '#334155';
const MUTED = '#64748b';

function buildContractPdf({
  tipo,
  esOtros,
  esMaestria,
  esPasaporte,
  alumno,        // { nombre, apellidos, dni_numero, direccion }
  cliente,       // { nombre, dni }
  numCarreras,   // 1|2|3
  fechaStr,      // "DD de Mes de YYYY"
  signatureDataUrl, // data:image/png;base64,...
}) {
  return new Promise((resolve, reject) => {
    try {
      const key = variantKey(tipo, esOtros);
      const variant = VARIANTS[key];
      if (!variant) throw new Error('variante de contrato desconocida: ' + key);

      const alumnoNombre = [alumno && alumno.nombre, alumno && alumno.apellidos].filter(Boolean).join(' ').trim() || '—';
      const alumnoDoc = (alumno && alumno.dni_numero) || '—';
      const alumnoDireccion = (alumno && alumno.direccion) || '—';
      const clienteNombre = (cliente && cliente.nombre) || '—';
      const clienteDoc = (cliente && cliente.dni) || '—';
      const docLabel = esPasaporte ? 'Pasaporte' : 'DNI';

      const values = {
        CLIENTE_NOMBRE: clienteNombre,
        CLIENTE_DOC: clienteDoc,
        CLIENTE_DOC_LABEL: docLabel,
        ALUMNO_NOMBRE: alumnoNombre,
        ALUMNO_DOC: alumnoDoc,
        ALUMNO_DOC_LABEL: docLabel,
        DIRECCION: alumnoDireccion,
        NUM_CARRERAS: numCarreras ? String(numCarreras) : '1, 2 o 3',
        FECHA: fechaStr || '',
      };

      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
        info: {
          Title: variant.title,
          Author: 'PROJECT ROBIN STUDENTS MOBILITY S.L.',
          Subject: 'Contrato firmado',
          CreationDate: new Date(),
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ----- Cabecera -----
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(variant.title, { align: 'center' });
      doc.moveDown(1);
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.7);

      // ----- Cuerpo: walk blocks -----
      for (const b of variant.blocks) {
        switch (b.type) {
          case 'h2':
            doc.moveDown(0.6);
            doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(b.text, { align: 'left' });
            doc.moveDown(0.2);
            break;
          case 'h3':
            doc.moveDown(0.4);
            doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(b.text, { align: 'left' });
            doc.moveDown(0.15);
            break;
          case 'p':
            doc.fillColor(SLATE).font('Helvetica').fontSize(10).text(fill(b.text, values), { align: 'justify', lineGap: 2 });
            doc.moveDown(0.4);
            break;
          case 'ul':
            doc.fillColor(SLATE).font('Helvetica').fontSize(10);
            for (const it of (b.items || [])) {
              const txt = fill(it, values);
              doc.text('• ' + txt, { indent: 16, lineGap: 2, align: 'justify' });
              doc.moveDown(0.15);
            }
            doc.moveDown(0.3);
            break;
          case 'spacer':
            doc.moveDown(0.6);
            break;
          default:
            // ignorar tipos desconocidos
            break;
        }
      }

      // ----- Firmas -----
      doc.moveDown(1.2);
      doc.strokeColor('#e2e8f0').lineWidth(1)
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke();
      doc.moveDown(0.6);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text('Firmas');
      doc.moveDown(0.8);

      const startY = doc.y;
      const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - 30) / 2;
      const leftX = doc.page.margins.left;
      const rightX = leftX + colWidth + 30;

      // Columna izquierda — Robin
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('POR PROJECT ROBIN STUDENTS MOBILITY S.L.', leftX, startY, { width: colWidth });
      doc.moveDown(0.4);
      // "firma" estilizada en cursiva del administrador
      doc.fillColor(NAVY).font('Helvetica-Oblique').fontSize(18).text('Noel Cortés Córdoba', leftX, doc.y, { width: colWidth });
      doc.moveTo(leftX, doc.y + 2).lineTo(leftX + colWidth - 10, doc.y + 2).strokeColor('#94a3b8').stroke();
      doc.moveDown(0.4);
      doc.fillColor(SLATE).font('Helvetica').fontSize(10).text('Administrador — NIF B75355057', leftX, doc.y, { width: colWidth });
      doc.fillColor(MUTED).fontSize(9).text('Fecha: ' + fechaStr, leftX, doc.y, { width: colWidth });

      const leftEndY = doc.y;

      // Columna derecha — Cliente
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('POR EL CLIENTE', rightX, startY, { width: colWidth });
      doc.moveDown(0.4);
      // imagen de firma si está disponible
      const sig = String(signatureDataUrl || '');
      const m = sig.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
      if (m) {
        try {
          const buf = Buffer.from(m[1], 'base64');
          const imgY = doc.y;
          doc.image(buf, rightX, imgY, { fit: [colWidth - 10, 60] });
          // Avanzamos manualmente porque doc.image no actualiza y
          doc.y = imgY + 60;
        } catch (_) {
          // si la imagen está corrupta, dejar línea en blanco
          doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(11).text('(firma)', rightX, doc.y, { width: colWidth });
        }
      } else {
        doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(11).text('(firma)', rightX, doc.y, { width: colWidth });
      }
      doc.moveTo(rightX, doc.y + 2).lineTo(rightX + colWidth - 10, doc.y + 2).strokeColor('#94a3b8').stroke();
      doc.moveDown(0.4);

      doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(10).text(clienteNombre, rightX, doc.y, { width: colWidth });
      doc.fillColor(SLATE).font('Helvetica').fontSize(10);
      if (esMaestria) {
        doc.text(docLabel + ' del firmante: ' + clienteDoc, rightX, doc.y, { width: colWidth });
      } else {
        doc.text('Tutor legal de ' + alumnoNombre + ' (' + docLabel + ' ' + alumnoDoc + ')', rightX, doc.y, { width: colWidth });
        doc.text(docLabel + ' del firmante (tutor legal): ' + clienteDoc, rightX, doc.y, { width: colWidth });
      }
      doc.fillColor(MUTED).fontSize(9).text('Fecha: ' + fechaStr, rightX, doc.y, { width: colWidth });

      const rightEndY = doc.y;
      doc.y = Math.max(leftEndY, rightEndY);
      // Restaurar x al margen izquierdo (drawText con (x,y) deja el cursor en esa columna)
      doc.x = doc.page.margins.left;

      // ----- Footer obligatorio -----
      doc.moveDown(1.5);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
        .text(
          variant.acceptanceFooter,
          { align: 'center' }
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { buildContractPdf };
