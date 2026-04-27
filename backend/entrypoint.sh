#!/bin/sh
set -eu

python manage.py migrate
python manage.py collectstatic --noinput
python manage.py bootstrap_demo_environment

exec "$@"
