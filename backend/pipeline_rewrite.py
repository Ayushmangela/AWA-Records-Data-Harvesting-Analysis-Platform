import re

with open('app/services/pipeline.py', 'r') as f:
    content = f.read()

# We'll completely rewrite pipeline.py since the multiprocessing approach fundamentally changes it
