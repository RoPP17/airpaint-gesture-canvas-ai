import http.server
import socketserver
import webbrowser
import threading
import os
import sys

PORT = 8080

def open_browser():
    print(f"Abriendo AirPaint en tu navegador web...")
    webbrowser.open(f"http://localhost:{PORT}")

def run_server():
    # Change current working directory to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    Handler = http.server.SimpleHTTPRequestHandler
    # Allow port reuse to avoid 'Address already in use' errors on quick restarts
    socketserver.TCPServer.allow_reuse_address = True
    
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print(f"=== Servidor Local de AirPaint ===")
            print(f"Ejecutándose en: http://localhost:{PORT}")
            print(f"Para detener el servidor, presiona Ctrl+C en esta terminal.")
            print(f"==================================")
            
            # Start timer to open browser
            threading.Timer(0.8, open_browser).start()
            
            httpd.serve_forever()
    except Exception as e:
        print(f"Error al iniciar el servidor: {e}")
        print("Intenta cerrar cualquier otro servidor que use el puerto 8080.")
        input("Presiona Enter para salir...")

if __name__ == "__main__":
    run_server()
