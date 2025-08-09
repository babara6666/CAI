"""
Celery application for background task processing.
"""

from celery import Celery

from src.core.config import get_settings

settings = get_settings()

# Create Celery app
celery_app = Celery(
    "cad_ai_service",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "src.tasks.training_tasks",
        "src.tasks.inference_tasks",
        "src.tasks.data_processing_tasks",
    ]
)

# Configure Celery
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=settings.training_timeout,
    task_soft_time_limit=settings.training_timeout - 60,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    result_expires=3600,
)