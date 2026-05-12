#include "runtime.h"

typedef struct __attribute__((packed)) { uint8_t magic; uint8_t version; uint32_t length; uint16_t flags; } Header;

int main(void) {
    TSC_INIT();
    return 0;
}
