# Kubernetes manifests (generic)

These manifests are intentionally generic and should work on most clusters.

## Apply

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Optional:
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
```

## Notes

- Replace `image:` in `deployment.yaml` with your registry image.
- `MONGO_URI` and AWS credentials are in `secret.yaml` as placeholders.
- Probes use TCP checks (no `/health` endpoint in the app).
