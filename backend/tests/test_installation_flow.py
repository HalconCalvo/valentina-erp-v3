"""Installation (ROADMAP task 10): the yard loads the truck scanning a bundle of the house, Field marks the work
finished and takes the client's signature. D15: only the signature creates crew payroll, ready to pay."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.design import VersionComponent
from app.models.foundations import GlobalConfig
from app.models.material import Material, ProductionRoute
from app.models.production import InstallationAssignment, InstallationAssignmentStatus, PayrollPayment, PayrollStatus
from app.models.sales import InstanceStatus, SalesOrderItem, SalesOrderItemInstance
from app.models.users import User, UserRole
from tests.sales_helpers import create_order_via_quotation

API = settings.API_V1_STR
QR = "0ba3b3e6-5753-4572-950c-2f8831bf5842"


def _user(session, role: UserRole, name: str) -> tuple[User, dict]:
    user = User(email=f"{name.lower()}@install.local", full_name=name, role=role, is_active=True,
                hashed_password=get_password_hash("Pass123!"))
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_access_token(subject=user.email, user_id=user.id, user_role=role.value)
    return user, {"Authorization": f"Bearer {token}"}


def _ready_house(client, session, headers, seed) -> tuple[SalesOrderItemInstance, InstallationAssignment, dict]:
    session.add(GlobalConfig(company_name="K", target_profit_margin=0.45, cost_tolerance_percent=0.03,
                             quote_validity_days=15, default_edgebanding_factor=1.1,
                             default_leader_daily_rate=900.0, default_helper_daily_rate=600.0))
    session.commit()
    order = create_order_via_quotation(client, headers, seed[0].id, seed[1].id)
    item = session.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    instance = session.exec(select(SalesOrderItemInstance)
                            .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    instance.production_status, instance.qr_code = InstanceStatus.READY, QR
    instance.mdf_bundles, instance.hardware_bundles = 3, 1
    leader, leader_headers = _user(session, UserRole.LOGISTICS, "Lider")
    helper, _ = _user(session, UserRole.LOGISTICS, "Ayudante")
    lane = InstallationAssignment(instance_id=instance.id, lane="IM", assignment_date=datetime(2026, 10, 12, 9),
                                  leader_user_id=leader.id, helper_1_user_id=helper.id)
    session.add_all([instance, lane])
    session.commit()
    session.refresh(lane)
    return instance, lane, leader_headers


def _payroll(session) -> list[PayrollPayment]:
    session.expire_all()
    return session.exec(select(PayrollPayment)).all()


def test_load_accepts_only_a_bundle_of_the_house_and_creates_no_payroll(client_fixture, session_fixture,
                                                                         auth_header_director, seed_client_and_tax):
    instance, lane, leader = _ready_house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    preview = f"{API}/logistics/assignments/{lane.id}/preview-scan"
    for bad in ("CUALQUIER-TEXTO", f"{QR}-5", f"{QR}-0", "ffffffff-1"):
        assert client_fixture.post(preview, headers=leader, json={"bundle_qr_uuid": bad}).status_code == 422, bad
    seen = client_fixture.post(preview, headers=leader, json={"bundle_qr_uuid": "0BA3B3E6-2"}).json()
    assert (seen["bultos_mdf"], seen["bultos_herrajes"], seen["bulto"], seen["puede_confirmar"]) == (3, 1, 2, True)
    other, other_headers = _user(session_fixture, UserRole.LOGISTICS, "Otro")
    load = f"{API}/logistics/equipos/{lane.id}/scan-qr"
    assert client_fixture.post(load, headers=other_headers, json={"bundle_qr_uuid": f"{QR}-1"}).status_code == 403
    loaded = client_fixture.post(load, headers=leader, json={"bundle_qr_uuid": f"{QR}-1"})
    assert loaded.status_code == 200, loaded.text
    session_fixture.expire_all()
    assert session_fixture.get(SalesOrderItemInstance, instance.id).production_status == InstanceStatus.CARGADO
    assert session_fixture.get(InstallationAssignment, lane.id).status == InstallationAssignmentStatus.IN_PROGRESS
    assert _payroll(session_fixture) == []
    again = client_fixture.post(load, headers=leader, json={"bundle_qr_uuid": f"{QR}-1"})
    assert again.status_code == 400


def test_a_house_without_labels_cannot_be_loaded(client_fixture, session_fixture, auth_header_director,
                                                 seed_client_and_tax):
    instance, lane, leader = _ready_house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    instance.qr_code = None
    session_fixture.add(instance)
    session_fixture.commit()
    response = client_fixture.post(f"{API}/logistics/equipos/{lane.id}/scan-qr", headers=leader,
                                   json={"bundle_qr_uuid": f"{QR}-1"})
    assert response.status_code == 409


def test_finished_work_requires_the_load_and_signature_requires_finished_work(
        client_fixture, session_fixture, auth_header_director, seed_client_and_tax):
    instance, lane, leader = _ready_house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    installed = f"{API}/field/assignments/{lane.id}/installed"
    assert client_fixture.post(installed, headers=leader).status_code == 409  # not loaded yet
    client_fixture.post(f"{API}/logistics/equipos/{lane.id}/scan-qr", headers=leader,
                        json={"bundle_qr_uuid": f"{QR}-1"})
    sync = f"{API}/field/instances/{instance.id}/sync"
    early = client_fixture.post(sync, headers=leader, json={"signature_base64": "data:image/png;base64,iVBORw0KGgo=",
                                                            "notes": "Cliente presente"})
    assert early.status_code == 409
    session_fixture.expire_all()
    assert "Cliente presente" in session_fixture.get(SalesOrderItemInstance, instance.id).field_work_notes
    _, stranger = _user(session_fixture, UserRole.LOGISTICS, "Ajeno")
    assert client_fixture.post(installed, headers=stranger).status_code == 403
    assert client_fixture.post(installed, headers=leader).status_code == 200
    assert _payroll(session_fixture) == []


def test_signature_closes_the_house_and_creates_payroll_ready_to_pay(client_fixture, session_fixture,
                                                                     auth_header_director, seed_client_and_tax):
    instance, lane, leader = _ready_house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    client_fixture.post(f"{API}/logistics/equipos/{lane.id}/scan-qr", headers=leader,
                        json={"bundle_qr_uuid": f"{QR}-1"})
    client_fixture.post(f"{API}/field/assignments/{lane.id}/installed", headers=leader)
    mine = client_fixture.get(f"{API}/field/my-assignments", headers=leader).json()["assignments"]
    house = next(a for a in mine if a["id"] == instance.id)
    assert house["can_sign"] is True and house["lanes"][0]["status"] == "INSTALLED"
    signed = client_fixture.post(f"{API}/field/instances/{instance.id}/sync", headers=leader,
                                 json={"signature_base64": "data:image/png;base64,iVBORw0KGgo="})
    assert signed.status_code == 200, signed.text
    assert signed.json()["signed_at"]
    session_fixture.expire_all()
    closed = session_fixture.get(SalesOrderItemInstance, instance.id)
    assert closed.production_status == InstanceStatus.CLOSED and closed.signed_received_at
    done = session_fixture.get(InstallationAssignment, lane.id)
    assert done.status == InstallationAssignmentStatus.COMPLETED and done.client_signature_url
    rows = sorted((p.total_amount, p.status) for p in _payroll(session_fixture))
    assert rows == [(600.0, PayrollStatus.READY_TO_PAY), (900.0, PayrollStatus.READY_TO_PAY)]
    # the test recipe has no INSTALACOCINA line: 1 day and the payroll says the recipe needs correcting
    assert all("INSTALACOCINA" in p.admin_notes for p in _payroll(session_fixture))


def test_progress_invoice_does_not_touch_payroll(client_fixture, session_fixture, auth_header_director,
                                                 seed_client_and_tax):
    instance, lane, leader = _ready_house(client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    client_fixture.post(f"{API}/logistics/equipos/{lane.id}/scan-qr", headers=leader,
                        json={"bundle_qr_uuid": f"{QR}-1"})
    item = session_fixture.get(SalesOrderItem, instance.sales_order_item_id)
    response = client_fixture.post(f"{API}/sales/orders/{item.sales_order_id}/register_progress",
                                   headers=auth_header_director,
                                   json={"amount": 1000.0, "invoice_folio": "A-1", "instance_ids": [instance.id]})
    assert response.status_code == 200, response.text
    assert _payroll(session_fixture) == []


def _two_lane_house(client, session, headers, seed):
    """A kitchen with furniture and stone: the IM lane from _ready_house plus an IP lane with its own leader."""
    from app.models.design import ProductMaster, ProductVersion
    from app.models.production import ProductionBatch, ProductionBatchStatus
    instance, im_lane, im_leader = _ready_house(client, session, headers, seed)
    master = ProductMaster(name="Cocina con cubierta", client_id=seed[0].id)
    session.add(master)
    session.commit()
    version = ProductVersion(master_id=master.id, version_name="V1", status="READY",
                             has_mdf_components=True, has_stone_components=True)
    stone_batch = ProductionBatch(folio="LOTE-PIEDRA-T1", batch_type="PIEDRA", status=ProductionBatchStatus.IN_PRODUCTION)
    session.add_all([version, stone_batch])
    session.commit()
    item = session.get(SalesOrderItem, instance.sales_order_item_id)
    item.origin_version_id = version.id
    instance.stone_batch_id, instance.stone_pieces = stone_batch.id, 2
    stone_leader, stone_headers = _user(session, UserRole.LOGISTICS, "Piedrero")
    session.add_all([item, instance])
    session.commit()
    return instance, im_lane, im_leader, stone_batch, stone_leader, stone_headers


def test_a_house_with_stone_is_not_signed_without_its_stone_lane(client_fixture, session_fixture,
                                                                 auth_header_director, seed_client_and_tax):
    instance, im_lane, im_leader, stone_batch, stone_leader, stone_headers = _two_lane_house(
        client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    client_fixture.post(f"{API}/logistics/equipos/{im_lane.id}/scan-qr", headers=im_leader,
                        json={"bundle_qr_uuid": f"{QR}-1"})
    client_fixture.post(f"{API}/field/assignments/{im_lane.id}/installed", headers=im_leader)
    house = next(a for a in client_fixture.get(f"{API}/field/my-assignments", headers=im_leader).json()["assignments"]
                 if a["id"] == instance.id)
    assert house["can_sign"] is False
    assert [(lane["lane"], lane["status"]) for lane in house["lanes"]] == [("IM", "INSTALLED"), ("IP", "UNASSIGNED")]
    sync = f"{API}/field/instances/{instance.id}/sync"
    assert client_fixture.post(sync, headers=im_leader,
                               json={"signature_base64": "data:image/png;base64,iVBORw0KGgo="}).status_code == 409
    ip_lane = InstallationAssignment(instance_id=instance.id, lane="IP", assignment_date=datetime(2026, 10, 12, 9),
                                     leader_user_id=stone_leader.id)
    session_fixture.add(ip_lane)
    session_fixture.commit()
    session_fixture.refresh(ip_lane)
    load = f"{API}/logistics/equipos/{ip_lane.id}/scan-qr"
    in_factory = client_fixture.post(load, headers=stone_headers, json={"bundle_qr_uuid": QR[:8]})
    assert in_factory.status_code == 400 and "LOTE-PIEDRA-T1" in in_factory.json()["detail"]
    stone_batch.status = "PACKING"
    session_fixture.add(stone_batch)
    session_fixture.commit()
    preview = client_fixture.post(f"{API}/logistics/assignments/{ip_lane.id}/preview-scan", headers=stone_headers,
                                  json={"bundle_qr_uuid": QR}).json()
    assert (preview["lane"], preview["piezas_piedra"], preview["puede_confirmar"]) == ("IP", 2, True)
    assert client_fixture.post(load, headers=stone_headers, json={"bundle_qr_uuid": QR[:8]}).status_code == 200
    client_fixture.post(f"{API}/field/assignments/{ip_lane.id}/installed", headers=stone_headers)
    signed = client_fixture.post(sync, headers=stone_headers,
                                 json={"signature_base64": "data:image/png;base64,iVBORw0KGgo="})
    assert signed.status_code == 200, signed.text
    assert len(_payroll(session_fixture)) == 3  # IM leader + helper, IP leader


def _installation_line(session, version_id: int, sku: str, days: float, unit: str = "Día") -> None:
    material = Material(sku=sku, name=f"Instalación {sku}", category="Proceso", production_route=ProductionRoute.PROCESO,
                        purchase_unit=unit, usage_unit=unit, current_cost=1600.0)
    session.add(material)
    session.commit()
    session.add(VersionComponent(version_id=version_id, material_id=material.id, quantity=days))
    session.commit()


def test_crew_payroll_takes_the_days_of_each_lane_installation_line(client_fixture, session_fixture,
                                                                    auth_header_director, seed_client_and_tax):
    """D18: furniture pays the INSTALACOCINA days, stone the INSTALAGRANITO days, × the daily rate."""
    instance, im_lane, im_leader, stone_batch, stone_leader, stone_headers = _two_lane_house(
        client_fixture, session_fixture, auth_header_director, seed_client_and_tax)
    version_id = session_fixture.get(SalesOrderItem, instance.sales_order_item_id).origin_version_id
    _installation_line(session_fixture, version_id, "INSTALACOCINA", 1.5)
    _installation_line(session_fixture, version_id, "INSTALAGRANITO", 0.5)
    stone_batch.status = "PACKING"
    ip_lane = InstallationAssignment(instance_id=instance.id, lane="IP", assignment_date=datetime(2026, 10, 12, 9),
                                     leader_user_id=stone_leader.id)
    session_fixture.add_all([stone_batch, ip_lane])
    session_fixture.commit()
    for lane_id, headers, code in ((im_lane.id, im_leader, f"{QR}-1"), (ip_lane.id, stone_headers, QR[:8])):
        assert client_fixture.post(f"{API}/logistics/equipos/{lane_id}/scan-qr", headers=headers,
                                   json={"bundle_qr_uuid": code}).status_code == 200
        assert client_fixture.post(f"{API}/field/assignments/{lane_id}/installed", headers=headers).status_code == 200
    signed = client_fixture.post(f"{API}/field/instances/{instance.id}/sync", headers=stone_headers,
                                 json={"signature_base64": "data:image/png;base64,iVBORw0KGgo="})
    assert signed.status_code == 200, signed.text
    rows = sorted((p.installation_assignment_id, p.payment_type.value, p.days_worked, p.total_amount, p.admin_notes)
                  for p in _payroll(session_fixture))
    assert rows == sorted([(im_lane.id, "LEADER", 1.5, 1350.0, None), (im_lane.id, "HELPER", 1.5, 900.0, None),
                           (ip_lane.id, "LEADER", 0.5, 450.0, None)])
