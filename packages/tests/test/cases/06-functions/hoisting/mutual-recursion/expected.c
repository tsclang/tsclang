#include "runtime.h"

bool isEven_f64(double n);

bool isOdd_f64(double n) {
    if (n == 0) {
        return false;
    }
    return isEven_f64(n - 1);
}

bool isEven_f64(double n) {
    if (n == 0) {
        return true;
    }
    return isOdd_f64(n - 1);
}

int main(void) {
    TSC_INIT();
    printf("%s\n", isEven_f64(10) ? "true" : "false");
    printf("%s\n", isOdd_f64(7) ? "true" : "false");
    return 0;
}
