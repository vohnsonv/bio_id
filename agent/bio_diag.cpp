#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <IBScanUltimateApi.h>

void check_res(int res, const char* msg) {
    if (res == 0) printf("[ OK ] %s\n", msg);
    else printf("[FAIL] %s (Erro: %d)\n", msg, res);
}

int main() {
    int count = 0;
    IBSU_GetDeviceCount(&count);
    printf("\n========================================\n");
    printf("   BioID - Diagnostico Watson Mini\n");
    printf("========================================\n");
    printf("Dispositivos detectados: %d\n", count);
    
    if (count == 0) {
        printf("\n[!] Nenhum leitor Integrated Biometrics encontrado.\n");
        printf("Dica: Verifique a conexao USB e as regras udev.\n");
        return 1;
    }

    int handle = -1;
    int res = IBSU_OpenDevice(0, &handle);
    check_res(res, "Abertura de Dispositivo");
    if (res != 0) return 1;

    // 1. Identificacao
    char product[128] = {0};
    char sn[128] = {0};
    char fw[128] = {0};
    IBSU_GetProperty(handle, ENUM_IBSU_PROPERTY_PRODUCT_ID, product);
    IBSU_GetProperty(handle, ENUM_IBSU_PROPERTY_SERIAL_NUMBER, sn);
    IBSU_GetProperty(handle, ENUM_IBSU_PROPERTY_FIRMWARE, fw);
    
    printf("\n--- Detalhes do Hardware ---\n");
    printf("Modelo:   %s\n", product);
    printf("S/N:      %s\n", sn);
    printf("Firmware: %s\n", fw);

    // 2. Beeper
    IBSU_BeeperType bType;
    res = IBSU_GetOperableBeeper(handle, &bType);
    if (res == 0 && bType != ENUM_IBSU_BEEPER_TYPE_NONE) {
        printf("\nTestando sinal sonoro (Beep)... ");
        fflush(stdout);
        IBSU_SetBeeper(handle, ENUM_IBSU_BEEP_PATTERN_GENERIC, 100, 100, 2, 0);
        printf("OK\n");
    }

    // 3. LEDs
    printf("Testando ciclo de LEDs... ");
    fflush(stdout);
    IBSU_SetLEOperationMode(handle, (IBSU_LEOperationMode)1); // Manual
    IBSU_SetLEDs(handle, 0xFF);
    sleep(1);
    IBSU_SetLEDs(handle, 0x00);
    printf("OK\n");

    printf("\n[!] Diagnostico finalizado com sucesso.\n");
    printf("========================================\n\n");
    
    IBSU_CloseDevice(handle);
    return 0;
}
