"""Sanitation tool 4: bulk update of the material catalog (template → validate → apply with a reason)."""
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from app.core.deps import CurrentUser, SessionDep
from app.core.permissions import allow
from app.schemas.material_import_schema import MaterialImportPreviewRead, MaterialImportResultRead
from app.services import material_import_service, material_service

router = APIRouter()
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


async def _read_xlsx(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Se requiere un archivo .xlsx")
    return await file.read()


@router.get("/template", dependencies=[allow(material_service.CATALOG_ROLES)])
def download_template(session: SessionDep):
    headers = {"Content-Disposition": 'attachment; filename="actualizacion_materiales.xlsx"'}
    return Response(material_import_service.template(session), media_type=XLSX, headers=headers)


@router.post("/validate", response_model=MaterialImportPreviewRead)
async def validate_import(session: SessionDep, current_user: CurrentUser, file: UploadFile = File(...)):
    return material_import_service.validate(session, await _read_xlsx(file), current_user)


@router.post("/apply", response_model=MaterialImportResultRead)
async def apply_import(session: SessionDep, current_user: CurrentUser, file: UploadFile = File(...),
                       reason: str = Form(...)):
    return material_import_service.apply(session, await _read_xlsx(file), reason, current_user)
