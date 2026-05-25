import logging
from pathlib import Path
from typing import Any, Dict

import pdf2image
import pdfplumber
import pytesseract
from PIL import Image

logger = logging.getLogger(__name__)


def extract_text_from_pdf(pdf_path: str | Path) -> Dict[str, Any]:
    """
    Extract text from a PDF file using pdfplumber, falling back to Tesseract OCR if needed.

    Returns a dictionary with keys:
    - text: full extracted text string
    - method: 'pdfplumber' or 'tesseract'
    - pages: number of pages processed
    - success: True or False
    """
    pdf_path = Path(pdf_path)
    result = {
        "text": "",
        "method": "pdfplumber",
        "pages": 0,
        "success": False,
    }

    if not pdf_path.exists():
        logger.error("PDF file does not exist: %s", pdf_path)
        return result

    # 1. Try pdfplumber first
    try:
        extracted_pages = []
        with pdfplumber.open(pdf_path) as pdf:
            result["pages"] = len(pdf.pages)
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_pages.append(text)

        full_text = "\n".join(extracted_pages).strip()
        if full_text:
            result["text"] = full_text
            result["method"] = "pdfplumber"
            result["success"] = True
            return result
    except Exception as e:
        logger.warning("pdfplumber extraction failed for %s, falling back to Tesseract: %s", pdf_path, e)

    # 2. Fall back to Tesseract if pdfplumber returns empty or fails
    try:
        logger.info("Starting Tesseract OCR fallback for %s", pdf_path)
        # Convert pages to images using pdf2image at 300 DPI
        images = pdf2image.convert_from_path(pdf_path, dpi=300)
        result["pages"] = len(images)

        ocr_pages = []
        for img in images:
            # Convert to grayscale using Pillow
            gray_img = img.convert("L")
            # Run pytesseract on each image
            page_text = pytesseract.image_to_string(gray_img)
            if page_text:
                ocr_pages.append(page_text)

        full_text = "\n".join(ocr_pages).strip()
        result["text"] = full_text
        result["method"] = "tesseract"
        result["success"] = bool(full_text)
        return result
    except Exception as e:
        logger.error("Tesseract OCR extraction failed for %s: %s", pdf_path, e)
        result["success"] = False
        return result
