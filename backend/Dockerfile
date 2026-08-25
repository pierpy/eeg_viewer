FROM python:3.11-slim

WORKDIR /app

# gcc/build tools: pyedflib doesn't always publish a prebuilt wheel for
# every platform (e.g. ARM hosts like Oracle Cloud's Ampere free tier),
# so make sure it can compile from source if needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
