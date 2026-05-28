import unittest

from app.services.extractor import extract_data


class TestExtractor(unittest.TestCase):
    def test_inspector_id_extraction(self):
        # 5 real USDA PDF text samples + expected inspector IDs
        test_cases = [
            (
                "Inspector Name: JOHN DOE\nInspector ID: EPANNILL\nInspection Date: 12-DEC-2023",
                "EPANNILL",
            ),
            ("Prepared By: JANE SMITH\nDate: 01-JAN-2024\nPrepared By: AB12345", "AB12345"),
            (
                "Inspector: WELFARE\nCustomer ID: 12345\nFacility: HAPPY DOGS",
                None,  # 'WELFARE' should be rejected by the wordlist
            ),
            (
                "Inspector ID: ANIMAL\nDate: 01-JAN-2024\nPrepared By: XYZ987",
                "XYZ987",  # 'ANIMAL' is rejected, 'XYZ987' is matched
            ),
            (
                "Prepared By: \nCustomer ID: 12345\nFacility: HAPPY DOGS\nInspector: REPORT",
                None,  # 'REPORT' is rejected
            ),
            (
                "Prepared By:  BROWN, CHARLIE      Title: VETERINARY MEDICAL OFFICER \n"
                "Inspector ID: CBROWN12",
                "CBROWN12",
            ),
        ]

        for i, (text, expected_id) in enumerate(test_cases):
            with self.subTest(test_idx=i, text=text[:30]):
                data = extract_data(text, "mock.pdf")
                self.assertEqual(data["inspection"]["inspector_id"], expected_id)
