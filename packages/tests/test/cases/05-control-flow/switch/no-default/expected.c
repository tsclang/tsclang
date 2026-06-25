#include "runtime.h"

int main(void) {
    TSC_INIT();
    int32_t x = 99;
    switch (x) {
        case 1:
            printf("one\n");
            break;
    }
    return 0;
}
