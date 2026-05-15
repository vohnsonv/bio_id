#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "IBScanUltimateApi.h"

extern "C" {

int init_sdk() {
    return 0; 
}

int open_device() {
    int deviceCount = 0;
    // No SDK IBScan, a maioria das funções retorna 0 para sucesso
    int res = IBSU_GetDeviceCount(&deviceCount);
    if (res != 0 || deviceCount == 0) return -1;
    return 0; 
}

int capture_fingerprint() {
    return 0;
}

int close_device() {
    return 0;
}

}
