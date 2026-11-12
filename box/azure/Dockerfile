# Simeon's cloud computer on Azure Container Apps Sandboxes (12 November 2026).
#
# box2's own image, exactly as Docker runs it on box2 and E2B runs it as a
# template (box/e2b/build_template.py, BOX2_IMAGE; the server's
# SIMEON_BOX_IMAGE and SIMEON_BOX_IMAGE_DIGEST), with three things added for
# a virtual machine the server starts from outside
# (server/simeon/sand/box_azure.py, docs/ops/box-host/azure-plan.md):
#
# - start-simeon-vm (box/bin/), the image's own start run as Docker runs it;
# - simeon-vm-init (box/azure/), the first process: it waits until the server
#   has written the person's settings, then runs start-simeon-vm;
# - an empty machine id, so no two computers share one.
#
# Built in Azure by box/azure/build.sh (`az acr build`, the box/ folder as the
# context), then made into the sandbox group's disk image.
FROM public.ecr.aws/k0i0n2g5/cursorenvironments/universal@sha256:322c3a9031d61e210a05400dd74c82bbb1fdb42db315a8cf5ab39368c2f0c1c8

USER root
COPY bin/start-simeon-vm /usr/local/bin/start-simeon-vm
COPY azure/simeon-vm-init /usr/local/bin/simeon-vm-init
RUN chmod 755 /usr/local/bin/start-simeon-vm /usr/local/bin/simeon-vm-init \
    && bash -n /usr/local/bin/start-simeon-vm \
    && bash -n /usr/local/bin/simeon-vm-init \
    && mkdir -p /var/lib/simeon && chmod 700 /var/lib/simeon \
    && : > /etc/machine-id && rm -f /var/lib/dbus/machine-id

ENTRYPOINT ["/usr/local/bin/simeon-vm-init"]
CMD []
