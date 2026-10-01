import fitz
from pathlib import Path
source = Path('attached_assets/lABORATORIO_1_MINERIA_DATOS_(1)_1790886647750.pdf')
out = Path('.agents/outputs/lab_pdf_pages')
out.mkdir(parents=True, exist_ok=True)
doc = fitz.open(source)
print('pages', doc.page_count)
for i, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(1.3, 1.3), alpha=False)
    pix.save(out / f'page-{i+1}.png')
    print('rendered', i+1, 'size', pix.width, pix.height)
