#include "runtime.h"

typedef d32_t Money;

int main(void) {
    TSC_INIT();
    Money m = 15000;
    Money price = 20000;
    Money total = m + price;
    return 0;
}
