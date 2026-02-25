def purge_expired_trash():
	"""Permanently delete trashed assets/folders older than the configured retention period."""
	from vms.deletion import purge_expired_trash

	purge_expired_trash()


def cleanup_expired_compress_jobs():
	"""Delete compress jobs and their R2 output files older than the configured retention period."""
	from vms.deletion import cleanup_expired_compress_jobs

	cleanup_expired_compress_jobs()
