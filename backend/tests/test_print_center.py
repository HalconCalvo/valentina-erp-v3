"""Print center (H34): a house with MDF and stone shows two rows: MDF bundles for labels, stone pieces for the
manifest."""
from datetime import datetime

from sqlmodel import select

from app.core.config import settings
from app.models.production import InstallationAssignment, InstallationAssignmentStatus
from app.models.sales import InstanceStatus, SalesOrderItem, SalesOrderItemInstance
from app.models.users import User, UserRole
from app.services.label_printer import generate_all_labels
from app.services.pdf_generator import PDFGenerator, house_and_product
from tests.sales_helpers import create_order_via_quotation

API = settings.API_V1_STR


def test_a_house_with_mdf_and_stone_is_two_rows(client_fixture, session_fixture, auth_header_director,
                                                seed_client_and_tax):
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    item = session_fixture.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    house = session_fixture.exec(select(SalesOrderItemInstance)
                                 .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    house.production_status, house.declared_bundles, house.stone_pieces = InstanceStatus.IN_PRODUCTION, 5, 2
    session_fixture.add(house)
    session_fixture.commit()
    rows = client_fixture.get(f"{API}/design/label_requests", headers=auth_header_director).json()
    mine = sorted((r["is_stone"], r["declared_bundles"], r["stone_pieces"]) for r in rows if r["instance_id"] == house.id)
    assert mine == [(False, 5, 0), (True, 0, 2)]


def test_label_house_comes_from_street_and_lot_or_the_baptized_name():
    """H31: the label shows the house in large type: street/lot, or the last two parts of the baptized name."""
    assert house_and_product("Cocina Obra Piloto - V1.0, Piloto, 1", None, None) == ("Piloto, 1", "Cocina Obra Piloto - V1.0")
    assert house_and_product("Cocina - V1.0", "Flamboyanes", "12")[0] == "Flamboyanes, 12"
    assert house_and_product("Cocina - V1.0", None, None) == ("Cocina - V1.0", "")


def test_labels_pdf_has_a_title_instead_of_untitled():
    """H32: the PDF title names the OV and the house."""
    labels = generate_all_labels(client_name="C", project_name="P", instance_name="x", mdf_bundles=1,
                                 hardware_bundles=0, qr_uuid="bd5662bf-1")
    pdf = PDFGenerator().generate_bundle_labels_pdf(labels=labels, client_name="C", project_name="P",
                                                    instance_name="Cocina, Piloto, 1", qr_uuid="bd5662bf-1",
                                                    order_folio="OV-0157").getvalue()
    assert b"Etiquetas OV-0157 Piloto, 1" in pdf


def test_each_lane_stays_until_that_lane_is_loaded(client_fixture, session_fixture, auth_header_director,
                                                   seed_client_and_tax):
    """H45: the house is CARGADO because MDF was loaded; the stone manifest stays until stone is loaded."""
    order = create_order_via_quotation(client_fixture, auth_header_director, seed_client_and_tax[0].id,
                                       seed_client_and_tax[1].id)
    item = session_fixture.exec(select(SalesOrderItem).where(SalesOrderItem.sales_order_id == order["id"])).first()
    house = session_fixture.exec(select(SalesOrderItemInstance)
                                 .where(SalesOrderItemInstance.sales_order_item_id == item.id)).first()
    house.production_status, house.declared_bundles, house.stone_pieces = InstanceStatus.CARGADO, 5, 2
    leader = User(email="lider@h45.local", full_name="Lider", role=UserRole.LOGISTICS, is_active=True,
                  hashed_password="x")
    session_fixture.add_all([house, leader])
    session_fixture.commit()
    mdf = InstallationAssignment(instance_id=house.id, lane="IM", leader_user_id=leader.id,
                                 assignment_date=datetime(2026, 10, 15), status=InstallationAssignmentStatus.IN_PROGRESS)
    stone = InstallationAssignment(instance_id=house.id, lane="IP", leader_user_id=leader.id,
                                   assignment_date=datetime(2026, 10, 15))
    session_fixture.add_all([mdf, stone])
    session_fixture.commit()

    def rows():
        data = client_fixture.get(f"{API}/design/label_requests", headers=auth_header_director).json()
        return [r["is_stone"] for r in data if r["instance_id"] == house.id]

    assert rows() == [True]
    stone.status = InstallationAssignmentStatus.IN_PROGRESS
    session_fixture.add(stone)
    session_fixture.commit()
    assert rows() == []
