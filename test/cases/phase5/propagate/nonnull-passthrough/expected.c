#include "runtime.h"

int32_t safe(void) {
    return 42;
}

int32_t run(void) {
    return safe();
}

int main(void) {
    TSC_INIT();
    return 0;
}
