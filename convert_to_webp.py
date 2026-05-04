import os
from PIL import Image

def convert_images_to_webp(directory):
    # Extensiones que vamos a buscar
    valid_extensions = ('.png', '.jpg', '.jpeg')
    
    print(f"🚀 Iniciando conversión en: {directory}")
    print("-" * 40)

    count = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(valid_extensions):
                # Rutas de archivo
                input_path = os.path.join(root, file)
                output_path = os.path.splitext(input_path)[0] + ".webp"
                
                try:
                    # Abrir la imagen
                    with Image.open(input_path) as img:
                        # Convertir y guardar como WebP
                        # quality=85 es un buen equilibrio entre peso y nitidez
                        img.save(output_path, "WEBP", quality=85)
                        count += 1
                        print(f"✅ Convertido: {file} -> {os.path.basename(output_path)}")
                except Exception as e:
                    print(f"❌ Error convirtiendo {file}: {e}")

    print("-" * 40)
    print(f"✨ ¡Listo! Se convirtieron {count} imágenes a formato WebP.")
    print("👉 Nota: Los archivos originales .png/.jpg se mantienen intactos.")

if __name__ == "__main__":
    # Ruta de tus imágenes
    target_dir = "assets/images"
    
    if os.path.exists(target_dir):
        convert_images_to_webp(target_dir)
    else:
        print(f"❌ La carpeta '{target_dir}' no existe. Verifica la ruta.")
