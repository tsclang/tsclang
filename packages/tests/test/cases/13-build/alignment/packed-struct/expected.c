#include "runtime.h"

typedef struct __attribute__((packed)) { uint8_t type; uint16_t length; uint32_t checksum; } Packet;

int main(void) {
    TSC_INIT();
    return 0;
}
