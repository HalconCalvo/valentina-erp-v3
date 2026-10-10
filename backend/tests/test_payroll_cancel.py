"""Changing the installation team before the signature cancels pending payroll; it is never deleted."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.models.production import InstallationAssignment, PayrollPayment, PayrollPaymentType, PayrollStatus
from app.models.users import User


def test_team_change_cancels_pending_payroll(client_fixture, session_fixture, auth_header_director):
    director = session_fixture.exec(select(User).where(User.role == "DIRECTOR")).first()
    assignment = InstallationAssignment(instance_id=1, lane="IM", assignment_date=datetime(2026, 10, 12),
                                        leader_user_id=director.id)
    session_fixture.add(assignment)
    session_fixture.flush()
    session_fixture.add(PayrollPayment(installation_assignment_id=assignment.id, user_id=director.id,
                                       payment_type=PayrollPaymentType.LEADER, days_worked=1, daily_rate=800,
                                       total_amount=800))
    session_fixture.commit()
    response = client_fixture.patch(f"{settings.API_V1_STR}/logistics/equipos/{assignment.id}/reasignar",
                                    headers=auth_header_director,
                                    json={"leader_user_id": director.id, "motivo": "Cambio de cuadrilla"})
    assert response.status_code == 200, response.text
    session_fixture.expire_all()
    payroll = session_fixture.exec(select(PayrollPayment)).one()
    assert payroll.status == PayrollStatus.CANCELLED and "cambio de equipo" in payroll.admin_notes
