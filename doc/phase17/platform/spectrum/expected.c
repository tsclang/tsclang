#include "runtime.h"

static uint8_t border = 0U;

void setPixel_usize_u8(uint16_t addr, uint8_t val) {
    border = val;
}

int main(void) {
    TSC_INIT();
    uint16_t screen = 0x4000U;
    return 0;
}
