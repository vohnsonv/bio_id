# Makefile para BioID Agent
CC = g++
CFLAGS = -fPIC -O3 -Wall
SDK_DIR = ./ib_sdk_linux/IBScanUltimate_x64_4.3.0
INCLUDES = -I$(SDK_DIR)/include
LIBS_DIR = -L$(SDK_DIR)/lib
LIBS = -lIBScanUltimate

# Alvos principais
all: libs/libbio_helper.so bio_diag

libs/libbio_helper.so: bio_helper.cpp
	mkdir -p libs
	$(CC) $(CFLAGS) -shared $(INCLUDES) bio_helper.cpp -o libs/libbio_helper.so $(LIBS_DIR) $(LIBS)

bio_diag: bio_diag.cpp
	$(CC) $(CFLAGS) $(INCLUDES) bio_diag.cpp -o bio_diag $(LIBS_DIR) $(LIBS)

dist/bio_agent: libs/libbio_helper.so bio_agent_ib.py
	@echo "Criando ambiente virtual e instalando dependencias..."
	python3 -m venv venv
	./venv/bin/pip install -r requirements.txt pyinstaller
	@echo "Gerando executavel..."
	./venv/bin/pyinstaller --onefile --name bio_agent \
		--add-data "libs/libbio_helper.so:libs" \
		bio_agent_ib.py
	@echo "Executavel gerado em dist/bio_agent"

build-exe: dist/bio_agent

clean:
	rm -f libs/libbio_helper.so bio_diag
	rm -rf build dist *.spec venv
	rm -f *.o

.PHONY: all clean build-exe
