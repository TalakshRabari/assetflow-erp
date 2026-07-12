import uvicorn
import sys
import os

if __name__ == "__main__":
    # Ensure correct working directory is the workspace root
    cwd = os.getcwd()
    sys.path.append(cwd)
    
    print("=" * 60)
    print("              AssetFlow Enterprise System            ")
    print("=" * 60)
    print("Initializing Database and starting local web server...")
    print("Frontend UI Address:   http://localhost:8000")
    print("Swagger API Docs:       http://localhost:8000/docs")
    print("=" * 60)
    print("Press Ctrl+C to terminate the server.\n")
    
    # Run the server
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
