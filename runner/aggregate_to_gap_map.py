"""
This script will take care of building the gap map
"""

import os
from pathlib import Path

# Finding the gap map folder to which results will be exported
gap_map_folder = Path(__file__).parent.parent / "gapmap"
if not os.path.exists(gap_map_folder):
    os.makedirs(gap_map_folder, exist_ok=True)

# Loading the results in a structured manner for easy comparison
results_folder = Path(__file__).parent.parent / "results"
result_json_files = [
    file for file in os.listdir(results_folder) if file.endswith(".json")
]
file_map = dict()
for i in result_json_files:
    standard, model, iteration = i.replace(".json", "").split("--")
    if standard not in file_map.keys():
        file_map[standard] = dict()

    file_map[standard][model] = file_map[standard].get(model, []) + [results_folder / i]

# Now the following needs to be implemented
# 1) a check of how much the models agree with themselves
# 2) a check of how much the models agree with each other
# 3) a decision on the gap map generation from this data (given the disagreements)
raise NotImplementedError()

# And then export the gap map (this is just a placeholder)
with open(gap_map_folder / "gap-map.json") as f:
    f.write("{}")
