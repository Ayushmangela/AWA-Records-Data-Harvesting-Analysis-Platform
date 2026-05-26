from openai import OpenAI
import os, json, re
from datetime import datetime
from sqlalchemy.orm import Session
from ..database import SessionLocal
from ..models import (Facility, Inspection,
    Violation, Inventory, AISummary)

client = OpenAI(
    base_url='https://api.groq.com/openai/v1',
    api_key=os.environ.get('GROQ_API_KEY'),
)

MODEL = 'llama-3.3-70b-versatile'

def format_records_for_ai(
    facility, inspections, db):
    lines = []
    lines.append(
        f'FACILITY: {facility.name}')
    lines.append(
        f'CERTIFICATE: '
        f'{facility.certificate_number}')
    lines.append(f'STATE: {facility.state}')
    lines.append(
        f'LICENSE: {facility.license_type}')
    lines.append('')

    for insp in inspections[:8]:
        lines.append(
            f'--- Inspection: '
            f'{insp.inspection_date} ---')
        lines.append(
            f'Type: {insp.inspection_type}')
        lines.append(
            f'Inspector: '
            f'{insp.inspector_name or "Unknown"}')
        lines.append(
            f'Violations: {insp.violation_count}')

        viols = db.query(Violation).filter(
            Violation.inspection_id == insp.id
        ).all()
        for v in viols:
            if v.description:
                lines.append(
                    f'  [{v.severity}] '
                    f'Sec {v.section or "?"}: '
                    f'{v.description[:150]}')

        inv = db.query(Inventory).filter(
            Inventory.inspection_id == insp.id
        ).all()
        if inv:
            animals = ', '.join([
                f'{i.count} {i.common_name}'
                for i in inv[:5]
            ])
            lines.append(f'Animals: {animals}')
        lines.append('')

    return '\n'.join(lines)

def parse_response(text):
    sentences = []
    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue
        if line.startswith('[FACT]'):
            txt = line[6:].strip()
            cite = extract_cite(txt)
            sentences.append({
                'type': 'FACT',
                'text': clean_cite(txt),
                'citation': cite
            })
        elif line.startswith('[INFERENCE]'):
            txt = line[11:].strip()
            cite = extract_cite(txt)
            sentences.append({
                'type': 'INFERENCE',
                'text': clean_cite(txt),
                'citation': cite
            })
        else:
            sentences.append({
                'type': 'TEXT',
                'text': line,
                'citation': None
            })
    return sentences

def extract_cite(text):
    m = re.search(
        r'\((?:Inspection|Source):[^)]+\)',
        text)
    return m.group() if m else None

def clean_cite(text):
    return re.sub(
        r'\s*\((?:Inspection|Source):[^)]+\)',
        '', text).strip()

def generate_facility_summary(facility_id):
    db = SessionLocal()
    try:
        facility = db.query(Facility).filter(
            Facility.id == facility_id
        ).first()
        if not facility:
            return {'error': 'Facility not found'}

        existing = db.query(AISummary).filter(
            AISummary.facility_id == facility_id
        ).order_by(
            AISummary.generated_at.desc()
        ).first()

        if existing:
            age = (datetime.utcnow() -
                   existing.generated_at
                   ).total_seconds() / 3600
            if age < 24:
                return json.loads(
                    existing.summary_json)

        inspections = db.query(Inspection).filter(
            Inspection.facility_id == facility_id
        ).order_by(
            Inspection.inspection_date.desc()
        ).limit(8).all()

        if not inspections:
            return {
                'error': 'No inspections found'
            }

        records = format_records_for_ai(
            facility, inspections, db)

        system = (
            'You are a legal research assistant '
            'analyzing USDA Animal Welfare Act '
            'inspection records.\n\n'
            'STRICT RULES:\n'
            '1. Only use facts from the records\n'
            '2. Every sentence MUST start with '
            '[FACT] or [INFERENCE]\n'
            '3. Add citation after each sentence: '
            '(Inspection: YYYY-MM-DD)\n'
            '4. Never make criminal accusations\n'
            '5. Use professional legal language\n'
            '6. Be concise and precise\n'
        )

        user = (
            f'Analyze this USDA inspection '
            f'history:\n\n{records}\n\n'
            f'Provide:\n'
            f'1. FACILITY OVERVIEW\n'
            f'2. COMPLIANCE PATTERN\n'
            f'3. KEY VIOLATIONS\n'
            f'4. INVESTIGATION PRIORITIES\n'
            f'5. RISK ASSESSMENT\n\n'
            f'Every sentence must start with '
            f'[FACT] or [INFERENCE]'
        )

        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {'role': 'system',
                 'content': system},
                {'role': 'user',
                 'content': user}
            ],
            max_tokens=1500,
            temperature=0.1,
            extra_headers={
                'HTTP-Referer':
                    'https://awa-platform.com',
                'X-Title': 'AWA Records Platform'
            }
        )

        raw = (response.choices[0]
               .message.content)
        sentences = parse_response(raw)

        result = {
            'facility_name': facility.name,
            'facility_id': facility_id,
            'generated_at':
                datetime.utcnow().isoformat(),
            'model': MODEL,
            'sentences': sentences,
            'total_inspections':
                len(inspections)
        }

        summary = AISummary(
            facility_id=facility_id,
            summary_json=json.dumps(result),
            model_used=MODEL
        )
        db.add(summary)
        db.commit()
        return result

    except Exception as e:
        return {'error': str(e)}
    finally:
        db.close()

def generate_legal_memo(facility_id):
    db = SessionLocal()
    try:
        facility = db.query(Facility).filter(
            Facility.id == facility_id
        ).first()
        if not facility:
            return {'error': 'Not found'}

        inspections = db.query(Inspection).filter(
            Inspection.facility_id == facility_id,
            Inspection.violations_found == True
        ).order_by(
            Inspection.inspection_date.desc()
        ).limit(5).all()

        records = format_records_for_ai(
            facility, inspections, db)

        today = datetime.now().strftime(
            '%B %d, %Y')

        prompt = (
            f'Draft a formal legal complaint '
            f'summary memo based on USDA '
            f'inspection records.\n\n'
            f'{records}\n\n'
            f'Format exactly as:\n\n'
            f'TO: Animal Welfare Investigation '
            f'Team\n'
            f'FROM: AWA Records Analysis '
            f'Platform\n'
            f'RE: {facility.name} | Certificate '
            f'{facility.certificate_number}\n'
            f'DATE: {today}\n\n'
            f'1. FACILITY INFORMATION\n'
            f'[facility details]\n\n'
            f'2. VIOLATION SUMMARY\n'
            f'[list violations with dates]\n\n'
            f'3. PATTERN ANALYSIS\n'
            f'[compliance patterns observed]\n\n'
            f'4. RECOMMENDED ACTIONS\n'
            f'[numbered action items]\n\n'
            f'5. SUPPORTING EVIDENCE\n'
            f'[cite specific inspections]\n\n'
            f'DISCLAIMER: AI-generated for '
            f'research purposes only. Human '
            f'legal review required.'
        )

        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {'role': 'user',
                 'content': prompt}
            ],
            max_tokens=2000,
            temperature=0.1,
            extra_headers={
                'HTTP-Referer':
                    'https://awa-platform.com',
                'X-Title': 'AWA Records Platform'
            }
        )

        memo = (response.choices[0]
                .message.content)

        return {
            'facility_name': facility.name,
            'certificate':
                facility.certificate_number,
            'generated_at':
                datetime.utcnow().isoformat(),
            'memo_text': memo,
            'disclaimer': (
                'AI-generated for research '
                'purposes only. Human legal '
                'review required before '
                'official use.'
            )
        }
    except Exception as e:
        return {'error': str(e)}
    finally:
        db.close()
