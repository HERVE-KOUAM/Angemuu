from dataclasses import dataclass
from datetime import date
from typing import List

@dataclass
class Calendar:
    id: str
    name: str
    non_working_days: List[date]

    def is_working_day(self, d: date) -> bool:
        return d not in self.non_working_days
