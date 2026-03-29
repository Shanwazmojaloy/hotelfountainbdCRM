import os

path = r"C:\Users\ahmed\OneDrive\Desktop\New folder\claude\Hotel Fountain CRM\index.html"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Corruption starts at line 1757 (index 1756) and ends at line 1771 (index 1770)
# We want to remove lines 1757 to 1771 inclusive.
del lines[1756:1771]

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Repair complete.")
