"""Creates the fixed development organisation, project and dataset so a fresh clone is usable."""

import uuid

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from layerline.models import Dataset, Organisation, Project

DEV_PROJECT_ID = uuid.UUID("00000000-0000-4000-8000-000000000002")
DEV_DATASET_ID = uuid.UUID("00000000-0000-4000-8000-000000000003")


def seed(session: Session, organisation_id: uuid.UUID) -> None:
    def upsert(model: type, **values: object) -> None:
        session.execute(insert(model).values(**values).on_conflict_do_nothing())

    upsert(Organisation, id=organisation_id, name="Dev organisation")
    upsert(Project, id=DEV_PROJECT_ID, organisation_id=organisation_id, name="Dev project")
    upsert(
        Dataset,
        id=DEV_DATASET_ID,
        organisation_id=organisation_id,
        project_id=DEV_PROJECT_ID,
        name="Dev dataset",
    )
    session.commit()
