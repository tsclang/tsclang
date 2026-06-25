#include "runtime.h"

int main(void) {
    TSC_INIT();
    if (false) {
        printf("yes\n");
    } else {
        printf("no\n");
    }
    return 0;
}
