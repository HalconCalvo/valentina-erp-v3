# 🚑 PROTOCOLO DE EMERGENCIA - VALENTINA ERP

SI NO PUEDES ENTRAR AL SISTEMA Y NINGUNA CONTRASEÑA FUNCIONA:

Este proyecto tiene una "puerta trasera" oculta en el código para crear
un usuario Administrador de emergencia.

## PASO 1: Reactivar la Puerta Trasera
1. Ve al archivo: `backend/app/api/v1/endpoints/login.py`
2. Al final del archivo, busca la sección "RUTA DE EMERGENCIA".
3. Verás que el código tiene símbolos `#` al inicio (está comentado).
4. BORRA los símbolos `#` para descomentar la función `create_rescue_admin`.
5. Guarda el archivo.

## PASO 2: Desplegar el Cambio
Desde tu terminal, sube el cambio a la nube:
`gcloud run deploy sgp-api --source .` (o el comando de deploy vigente).

## PASO 3: Ejecutar el Rescate
Una vez subido, entra a esta dirección web:
`https://[TU-URL-DEL-BACKEND]/api/v1/login/rescue/create-admin`

Esto reseteará al usuario:
- Usuario: admin@valentina.com
- Pass: admin123

## PASO 4: CERRAR LA PUERTA
¡IMPORTANTE! Una vez dentro, vuelve a poner los `#` en el código y
haz deploy de nuevo para que nadie más pueda usar esta puerta.

