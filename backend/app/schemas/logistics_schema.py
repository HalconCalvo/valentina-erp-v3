from datetime import date
from typing import List, Optional

from pydantic import BaseModel


class TeamAgendaInstanceRead(BaseModel):
    assignment_id: int
    instance_id: int
    instance_name: str
    order_folio: Optional[str] = None
    client_name: Optional[str] = None
    address: Optional[str] = None
    lane: str


class TeamAgendaTeamRead(BaseModel):
    leader_id: int
    leader_name: str
    helper_1_id: Optional[int] = None
    helper_1_name: Optional[str] = None
    helper_2_id: Optional[int] = None
    helper_2_name: Optional[str] = None
    instances: List[TeamAgendaInstanceRead] = []


class UnassignedAgendaInstanceRead(BaseModel):
    instance_id: int
    lane: str
    instance_name: str
    order_folio: Optional[str] = None
    client_name: Optional[str] = None
    address: Optional[str] = None


class TeamAgendaRead(BaseModel):
    workday: date
    teams: List[TeamAgendaTeamRead] = []
    unassigned: List[UnassignedAgendaInstanceRead] = []


class DayTeamUpdate(BaseModel):
    workday: date
    previous_leader_id: int
    leader_user_id: int
    helper_1_user_id: Optional[int] = None
    helper_2_user_id: Optional[int] = None


class AssignmentTeamUpdate(BaseModel):
    leader_user_id: int
    helper_1_user_id: Optional[int] = None
    helper_2_user_id: Optional[int] = None
