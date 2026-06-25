#include "runtime.h"

volatile uint8_t reg = 0x00;

int main(void) {
    TSC_INIT();
    reg = 0xAB;
    return 0;
}
